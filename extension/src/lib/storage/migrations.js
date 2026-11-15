// Schema migrations with a snapshot taken first and a rollback if a step fails.
// Part of the persistence layer; import from ../storage.js (the facade).

import { K, SCHEMA_VERSION } from './keys.js';
import { getMeta, saveMeta } from './days.js';
import { dayKey } from '../utils.js';

// ---- schema migrations ----
// Registered as { to: <version>, run: async () => {...} }. On startup `migrate()`
// applies every migration whose target exceeds the stored meta.version, in order,
// then stamps meta.version = SCHEMA_VERSION. New transforms are appended here.
const MIGRATIONS = [
  // v2 added the per-domain hourly map `dh`. It's additive and lazily populated,
  // so old day records need no rewrite — stats treat a missing `dh` as "no data".
  // v3 added the opt-in per-day session logs (ttt_sess_<day>) and settings.sessionLog
  // (defaults to false via DEFAULT_SETTINGS). Also additive: nothing to transform.
  { to: 3, run: async () => {} },
  // v4: multi-product hosts (mail.google.com, docs.google.com…) are now stored under their
  // product subdomain instead of the bare registrable domain. Old history is NOT rewritten
  // — time already stored under "google.com" can't be honestly split, so it stays as it is
  // and the day the split began is recorded for the UI to explain the change.
  { to: 4, run: async () => { await saveMeta({ productSplitFrom: dayKey() }); } },
];

// Keys a migration may rewrite: day records, session logs, focus log, index, settings, meta.
const MIGRATION_BACKUP_KEY = 'ttt_migration_backup';
const isMigratable = (k) =>
  k.startsWith('ttt_day_') || k.startsWith('ttt_sess_') ||
  [K.INDEX, K.SETTINGS, K.META, K.FOCUS_LOG].includes(k);

/** Copy every migratable key into one backup entry (skipped when there is nothing stored yet). */
async function snapshotForMigration(fromVersion) {
  const all = await chrome.storage.local.get(null);
  const data = {};
  for (const [k, v] of Object.entries(all)) if (isMigratable(k)) data[k] = v;
  if (!Object.keys(data).length) return false;
  await chrome.storage.local.set({ [MIGRATION_BACKUP_KEY]: { fromVersion, at: Date.now(), data } });
  return true;
}

/**
 * Put the data back exactly as the last snapshot had it: keys written after the snapshot
 * are removed, snapshotted keys are restored. Returns false if there is no snapshot.
 */
export async function rollbackMigration() {
  const stored = (await chrome.storage.local.get(MIGRATION_BACKUP_KEY))[MIGRATION_BACKUP_KEY];
  if (!stored || !stored.data) return false;
  const all = await chrome.storage.local.get(null);
  const extra = Object.keys(all).filter((k) => isMigratable(k) && !(k in stored.data));
  if (extra.length) await chrome.storage.local.remove(extra);
  await chrome.storage.local.set(stored.data);
  return true;
}

/** Drop the snapshot once the migrated data has been used successfully. */
export async function clearMigrationBackup() {
  await chrome.storage.local.remove(MIGRATION_BACKUP_KEY);
}

/**
 * Runs pending migrations. When one needs to run on existing data, a snapshot is taken
 * first; if any step throws, the snapshot is restored and the error is rethrown, so a
 * failed upgrade never leaves half-migrated history behind.
 */
export async function migrate({ migrations = MIGRATIONS, target = SCHEMA_VERSION } = {}) {
  const meta = await getMeta();
  const from = meta.version || 0;
  if (from >= target) {
    if (meta.version !== target) await saveMeta({ version: target });
    return { from, to: target, applied: 0, snapshot: false };
  }
  const pending = [...migrations].sort((a, b) => a.to - b.to).filter((m) => m.to > from && m.to <= target);
  const snapshot = from > 0 && pending.length ? await snapshotForMigration(from) : false;
  let applied = 0;
  try {
    for (const m of pending) {
      await m.run();
      applied++;
    }
    await saveMeta({ version: target });
  } catch (err) {
    if (snapshot) await rollbackMigration();
    throw err;
  }
  return { from, to: target, applied, snapshot };
}
