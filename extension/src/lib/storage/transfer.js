// Export, import (merge / replace with undo), settings-only restore, snapshot summaries.
// Part of the persistence layer; import from ../storage.js (the facade).

import { DAY_PREFIX, K, SCHEMA_VERSION, SESS_PREFIX } from './keys.js';
import { DEFAULT_SETTINGS, deepMerge, getSettings, saveSettings, withSettingsLock, writeSettingsUnlocked } from './settings.js';
import { emptyDay, getDays, getIndex, getMeta, saveMeta } from './days.js';
import { FOCUS_LOG_MAX, getFocusLog, getSessions } from './logs.js';
import { prunableDays, removeDays } from './maintenance.js';
import { describeIntegrity } from '../integrity.js';
import { sanitizeSnapshot } from '../snapshot.js';

/**
 * A random id for this install, created on first need and stored in meta. It travels in backups
 * so a future multi-device merge can tell whose days are whose; it identifies an install, not a person.
 */
async function ensureDeviceId() {
  const meta = await getMeta();
  if (meta.deviceId) return meta;
  return saveMeta({ deviceId: crypto.randomUUID() });
}

/**
 * Restore only the settings from a backup (history untouched). Credentials and the backup
 * target never come from a file, exactly as in importAll.
 */
export async function importSettingsOnly(snapshot) {
  const clean = sanitizeSnapshot(snapshot, DEFAULT_SETTINGS);   // throws BAD_SNAPSHOT before any change
  if (!clean.settings) throw Object.assign(new Error('the backup has no settings'), { code: 'BAD_SNAPSHOT' });
  await withSettingsLock(async () => {
    const local = await getSettings();
    const merged = deepMerge(DEFAULT_SETTINGS, clean.settings);
    merged.backup = local.backup;
    await writeSettingsUnlocked(merged);
  });
  return { days: 0, dropped: clean.dropped };
}

/**
 * Credentials stored in settings.backup. They live on this device only: a
 * snapshot (file export, cloud backup, custom endpoint) must never carry them,
 * or a plaintext export would hand the passphrase / bearer token to whoever
 * receives the file.
 */
function stripSecrets(settings) {
  return { ...settings, backup: { ...settings.backup, passphrase: '', endpointToken: '', davPassword: '' } };
}

/**
 * Full snapshot for export / backup (credentials removed — see stripSecrets).
 * Session logs ride along only when there are any; the 100 KB chrome.storage.sync
 * backup passes { sessions: false } because they would not fit.
 */
export async function exportAll({ sessions = true } = {}) {
  const settings = stripSecrets(await getSettings());
  const idx = await getIndex();
  const days = await getDays(idx);
  const meta = await ensureDeviceId();
  const snapshot = {
    app: 'TimeTrack',
    version: SCHEMA_VERSION,
    exportedAt: Date.now(),
    device: meta.deviceId,
    meta,
    settings,
    days,
    integrity: await describeIntegrity(days),
  };
  if (sessions) {
    const logs = await getSessions(idx);
    if (Object.keys(logs).length) snapshot.sessions = logs;
  }
  const focusLog = await getFocusLog();
  if (focusLog.length) snapshot.focusLog = focusLog;
  return snapshot;
}

/**
 * Restore a snapshot. mode "replace" makes the stored days exactly the snapshot's; "merge" keeps
 * the larger time/visits per domain so re-importing never double counts.
 * Returns { days, domainsChanged, dropped, retentionRelaxed }: domainsChanged counts domain-day
 * records whose merged value actually differs from what was already stored (null in "replace"
 * mode, where the concept of a "conflict" doesn't apply); dropped counts records that were
 * malformed and left out; retentionRelaxed says the imported history reached back past the
 * retention setting, so retention was switched to "keep everything" rather than deleting it.
 *
 * Safe by construction: the snapshot is validated before anything is touched, "replace" first
 * saves the current data as a one-step undo (see undoLastReplace), the new data is written in one
 * all-or-nothing set(), and only after that is anything the snapshot doesn't contain removed.
 */
export async function importAll(snapshot, { mode = 'merge', includeSettings = true } = {}) {
  const clean = sanitizeSnapshot(snapshot, DEFAULT_SETTINGS);   // throws BAD_SNAPSHOT before any change
  const keys = Object.keys(clean.days);
  if (mode === 'replace' && !keys.length) throw Object.assign(new Error('the backup has no usable days'), { code: 'BAD_SNAPSHOT' });

  // Real data never mixes with demo data: drop the demo first (it is only ever fake days).
  const demo = (await getMeta()).demoDays || [];
  if (demo.length) {
    await removeDays(demo);
    await saveMeta({ demoDays: [] });
  }
  if (mode === 'replace') await savePreReplaceSnapshot();

  const oldIndex = await getIndex();
  const existing = mode === 'merge' ? await getDays(keys) : {};
  const writes = {};
  let domainsChanged = 0;
  for (const key of keys) {
    if (mode === 'replace') {
      writes[K.day(key)] = clean.days[key];
    } else {
      const { day, changed } = mergeDay(existing[key] || emptyDay(), clean.days[key]);
      writes[K.day(key)] = day;
      domainsChanged += changed;
    }
  }
  const index = (mode === 'replace' ? keys : [...new Set([...oldIndex, ...keys])]).sort();
  writes[K.INDEX] = index;

  // Session logs: keep whichever side recorded more for a day, so re-importing the same
  // file never doubles entries (the same idempotence rule as the day aggregates).
  const sessionKeys = Object.keys(clean.sessions);
  if (sessionKeys.length) {
    const existingSessions = mode === 'merge' ? await getSessions(sessionKeys) : {};
    const total = (list) => (list || []).reduce((sum, e) => sum + (e[2] || 0), 0);
    for (const key of sessionKeys) {
      const keep = total(existingSessions[key]) >= total(clean.sessions[key]) ? existingSessions[key] : clean.sessions[key];
      if (keep && keep.length) writes[K.sess(key)] = keep;
    }
  }
  if (clean.focusLog && clean.focusLog.length) {
    // union by start time, so re-importing the same file never duplicates sessions
    const merged = new Map((mode === 'merge' ? await getFocusLog() : []).map((e) => [e.start, e]));
    for (const e of clean.focusLog) merged.set(e.start, e);
    writes[K.FOCUS_LOG] = [...merged.values()].sort((a, b) => a.start - b.start).slice(-FOCUS_LOG_MAX);
  }
  if (mode === 'replace') writes[K.META] = { ...(await getMeta()), firstDay: index[0] || null };

  await chrome.storage.local.set(writes);                         // all-or-nothing; the old data is still intact if this throws

  if (mode === 'replace') {
    // Only now remove what the snapshot doesn't contain — by prefix, so a day that was never indexed goes too.
    const keep = new Set(keys);
    const all = await chrome.storage.local.get(null);
    const stale = Object.keys(all).filter((k) => (k.startsWith(DAY_PREFIX) && !keep.has(k.slice(DAY_PREFIX.length)))
      || (k.startsWith(SESS_PREFIX) && !keep.has(k.slice(SESS_PREFIX.length))));
    if (stale.length) await chrome.storage.local.remove(stale);
  }

  if (includeSettings && clean.settings) {
    await withSettingsLock(async () => {
      const local = await getSettings();
      const merged = deepMerge(DEFAULT_SETTINGS, clean.settings);
      merged.backup = local.backup;                               // where this device backs up to (and its credentials) never come from a file
      await writeSettingsUnlocked(merged);
    });
  }

  // History older than the retention setting would be deleted at the next worker start. Importing it
  // was deliberate, so keep it and say so instead.
  const retention = (await getSettings()).retentionDays;
  const retentionRelaxed = prunableDays(keys, retention).length > 0;
  if (retentionRelaxed) await saveSettings({ retentionDays: 0 });

  return { days: keys.length, domainsChanged: mode === 'merge' ? domainsChanged : null, dropped: clean.dropped, retentionRelaxed };
}

// ---- one-step undo for "replace" ----
// A replace import or cloud restore first stores the data it is about to overwrite here, so a wrong
// file or a wrong backup is a click away from being undone. One generation: the next replace overwrites it.
async function savePreReplaceSnapshot() {
  if (!(await getIndex()).length) return;
  const snapshot = await exportAll({ sessions: true });
  await chrome.storage.local.set({ [K.PREV]: { savedAt: Date.now(), snapshot } });
}

/** { savedAt, days } for the saved pre-replace copy, or null. */
export async function getPreReplaceInfo() {
  const rec = (await chrome.storage.local.get(K.PREV))[K.PREV];
  return rec && rec.snapshot ? { savedAt: rec.savedAt, days: Object.keys(rec.snapshot.days || {}).length } : null;
}

/** Put back the data that the last replace overwrote (the current data becomes the new undo copy). */
export async function undoLastReplace() {
  const rec = (await chrome.storage.local.get(K.PREV))[K.PREV];
  if (!rec || !rec.snapshot) throw Object.assign(new Error('nothing to undo'), { code: 'NO_UNDO' });
  return importAll(rec.snapshot, { mode: 'replace', includeSettings: false });
}

/** Pure summary of a snapshot's shape — for confirming a restore before committing it. */
export function summarizeSnapshot(snapshot) {
  const days = (snapshot && snapshot.days) || {};
  const keys = Object.keys(days).sort();
  let totalSeconds = 0;
  const sites = new Set();
  for (const day of Object.values(days)) {
    for (const [domain, rec] of Object.entries(day.domains || {})) {
      totalSeconds += rec.t || 0;
      sites.add(domain);
    }
  }
  return {
    dayCount: keys.length,
    firstDay: keys[0] || null,
    lastDay: keys[keys.length - 1] || null,
    totalSeconds,
    siteCount: sites.size,
  };
}

function mergeDh(a = {}, b = {}) {
  const out = { ...a };
  for (const [h, v] of Object.entries(b)) out[h] = Math.max(out[h] || 0, v || 0);
  return Object.keys(out).length ? out : undefined;
}

/** Returns { day, changed } — changed counts domains whose merged value grew. */
function mergeDay(a, b) {
  const out = { domains: { ...a.domains }, hours: (a.hours || new Array(24).fill(0)).slice() };
  let changed = 0;
  for (const [domain, rec] of Object.entries(b.domains || {})) {
    const cur = Object.hasOwn(out.domains, domain) ? out.domains[domain] : { t: 0, v: 0 };
    const merged = { t: Math.max(cur.t, rec.t || 0), v: Math.max(cur.v, rec.v || 0) };
    const dh = mergeDh(cur.dh, rec.dh);
    if (dh) merged.dh = dh;
    if (merged.t !== cur.t || merged.v !== cur.v) changed++;
    out.domains[domain] = merged;
  }
  const bh = b.hours || [];
  for (let i = 0; i < 24; i++) out.hours[i] = Math.max(out.hours[i] || 0, bh[i] || 0);
  return { day: out, changed };
}
