// Cloud backup strategies:
//   1. chrome.storage.sync  — zero-config, rides Google account sync, chunked
//      to respect the ~8KB-per-item / ~100KB-total quota (oldest days trimmed).
//   2. Custom REST endpoint — POST the snapshot to an HTTPS URL the user controls.
// Either target can be end-to-end encrypted with a passphrase (see crypto.js):
// the server / sync store only ciphertext. File export/import lives in storage.js.

import { exportAll, importAll, getSettings, saveSettings } from './storage.js';
import { encryptJSON, decryptJSON, isEncrypted } from './crypto.js';

const SYNC_PREFIX = 'ttt_sync_';
const SYNC_META = 'ttt_sync_meta';
const SYNC_ITEM_LIMIT = 7000;          // bytes/chunk, under the 8192 per-item quota
const SYNC_MAX_CHUNKS = 14;            // ~14 * 7KB ≈ 98KB, under the 100KB sync total
// chrome.storage.sync caps at ~102400 bytes TOTAL, so the serialized payload must
// fit that — not 14*7KB of slack. Budgets leave room for chunk keys + meta.
const SYNC_PLAINTEXT_BUDGET = 80000;   // serialized snapshot budget (unencrypted)
const SYNC_ENCRYPTED_BUDGET = 50000;   // pre-encryption budget (base64 inflates ~1.34x)

function chunkString(str, size) {
  const chunks = [];
  for (let i = 0; i < str.length; i += size) chunks.push(str.slice(i, i + size));
  return chunks;
}

/** Drop oldest days until the serialized snapshot fits a byte budget. */
function trimToBudget(snapshot, budget) {
  const clone = { ...snapshot, days: { ...snapshot.days } };
  let keys = Object.keys(clone.days).sort();
  let json = JSON.stringify(clone);
  let trimmed = 0;
  while (json.length > budget && keys.length > 1) {
    delete clone.days[keys.shift()];
    trimmed++;
    json = JSON.stringify(clone);
  }
  return { snapshot: clone, trimmed };
}

function encryptionOn(settings) {
  return !!(settings.backup.encrypt && settings.backup.passphrase);
}

/** Build the serialized (and optionally encrypted) payload to transmit. */
async function buildPayload(settings, { forSync }) {
  let snapshot = await exportAll();
  let trimmed = 0;
  const encrypt = encryptionOn(settings);
  if (forSync) {
    const budget = encrypt ? SYNC_ENCRYPTED_BUDGET : SYNC_PLAINTEXT_BUDGET;
    ({ snapshot, trimmed } = trimToBudget(snapshot, budget));
  }
  const payload = encrypt ? await encryptJSON(snapshot, settings.backup.passphrase) : snapshot;
  return { json: JSON.stringify(payload), trimmed, encrypted: encrypt };
}

export async function backupToSync() {
  const settings = await getSettings();
  const { json, trimmed, encrypted } = await buildPayload(settings, { forSync: true });
  const chunks = chunkString(json, SYNC_ITEM_LIMIT);
  if (chunks.length > SYNC_MAX_CHUNKS) throw new Error('הגיבוי גדול מדי לסנכרון Google');

  const old = await chrome.storage.sync.get(null);
  const oldKeys = Object.keys(old).filter((k) => k.startsWith(SYNC_PREFIX));
  if (oldKeys.length) await chrome.storage.sync.remove(oldKeys);

  const writes = {};
  chunks.forEach((c, i) => { writes[`${SYNC_PREFIX}${i}`] = c; });
  writes[SYNC_META] = { chunks: chunks.length, ts: Date.now(), trimmed, encrypted };
  await chrome.storage.sync.set(writes);
  return { chunks: chunks.length, trimmed, bytes: json.length, encrypted };
}

export async function restoreFromSync({ mode = 'replace', passphrase } = {}) {
  const meta = (await chrome.storage.sync.get(SYNC_META))[SYNC_META];
  if (!meta || !meta.chunks) throw new Error('לא נמצא גיבוי בענן');
  const keys = [];
  for (let i = 0; i < meta.chunks; i++) keys.push(`${SYNC_PREFIX}${i}`);
  const parts = await chrome.storage.sync.get(keys);
  let json = '';
  for (let i = 0; i < meta.chunks; i++) {
    const piece = parts[`${SYNC_PREFIX}${i}`];
    if (piece == null) throw new Error('הגיבוי בענן פגום (חלק חסר)');
    json += piece;
  }
  let snapshot = JSON.parse(json);
  if (isEncrypted(snapshot)) {
    const pass = passphrase || (await getSettings()).backup.passphrase;
    if (!pass) { const e = new Error('הגיבוי מוצפן — נדרשת סיסמה'); e.code = 'ENCRYPTED'; throw e; }
    snapshot = await decryptJSON(snapshot, pass);
  }
  const count = await importAll(snapshot, { mode, includeSettings: true });
  return { days: count, ts: meta.ts };
}

export async function backupToEndpoint(url, token) {
  if (!/^https:\/\//i.test(url)) throw new Error('כתובת השרת חייבת להתחיל ב-https://');
  const settings = await getSettings();
  const { json } = await buildPayload(settings, { forSync: false });
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: json,
  });
  if (!res.ok) throw new Error(`השרת החזיר ${res.status}`);
  return { status: res.status };
}

/** Run whichever backup targets are configured; updates settings.backup meta. */
export async function runAutoBackup() {
  const settings = await getSettings();
  const b = settings.backup;
  const results = [];
  let ok = true;

  if (b.syncEnabled) {
    try {
      const r = await backupToSync();
      results.push(`ענן Google: ${r.chunks} מקטעים${r.encrypted ? ' 🔒' : ''}${r.trimmed ? ` (קוצצו ${r.trimmed} ימים)` : ''}`);
    } catch (e) {
      ok = false;
      results.push(`שגיאת סנכרון: ${e.message}`);
    }
  }
  if (b.endpointUrl) {
    try {
      await backupToEndpoint(b.endpointUrl, b.endpointToken);
      results.push(`שרת מותאם אישית: הצליח${encryptionOn(settings) ? ' 🔒' : ''}`);
    } catch (e) {
      ok = false;
      results.push(`שגיאת שרת: ${e.message}`);
    }
  }
  if (!b.syncEnabled && !b.endpointUrl) {
    return { ran: false, status: 'לא הוגדר יעד גיבוי' };
  }

  const status = (ok ? '✅ ' : '⚠️ ') + results.join(' • ');
  await saveSettings({ backup: { lastBackup: Date.now(), lastBackupStatus: status } });
  return { ran: true, ok, status };
}
