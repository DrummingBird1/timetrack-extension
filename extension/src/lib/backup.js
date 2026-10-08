// Cloud backup strategies:
//   1. chrome.storage.sync  — zero-config, rides Google account sync, chunked
//      to respect the ~8KB-per-item / ~100KB-total quota (oldest days trimmed).
//   2. Custom REST endpoint — POST the snapshot to an HTTPS URL the user controls.
// Either target can be end-to-end encrypted with a passphrase (see crypto.js):
// the server / sync store only ciphertext. File export/import lives in storage.js.

import { exportAll, importAll, getSettings, saveSettings, summarizeSnapshot } from './storage.js';
import { encryptJSON, decryptJSON, isEncrypted } from './crypto.js';

const SYNC_PREFIX = 'ttt_sync_';
const SYNC_META = 'ttt_sync_meta';
// chrome.storage.sync quotas are measured on the STORED form: key + JSON.stringify(value),
// in UTF-8 bytes. A chunk of serialized JSON is full of `"` characters that stringify to
// `\"`, so N characters can cost ~1.3N bytes — sizing by character count (as we once did)
// overflowed the per-item quota on any realistic history.
const SYNC_ITEM_BYTES = 8000;          // per-item budget (quota: 8192)
const SYNC_TOTAL_BYTES = 96000;        // all chunks together (quota: 102400; leaves room for the meta item)
// First guess for how much raw snapshot JSON fits; backupToSync() verifies the real
// stored size and tightens this when escaping inflated it more than expected.
const SYNC_PLAINTEXT_BUDGET = 72000;   // characters of serialized snapshot (unencrypted)
const SYNC_ENCRYPTED_BUDGET = 50000;   // pre-encryption budget (base64 inflates ~1.34x, but has no quotes)
const SYNC_MAX_ATTEMPTS = 8;

const utf8 = new TextEncoder();
const storedSize = (key, value) => utf8.encode(key).length + utf8.encode(JSON.stringify(value)).length;
const isHighSurrogate = (code) => code >= 0xD800 && code <= 0xDBFF;

/** Split `str` into pieces whose stored size (see above) fits one sync item. */
function chunkForSync(str) {
  const chunks = [];
  let pos = 0;
  while (pos < str.length) {
    const key = `${SYNC_PREFIX}${chunks.length}`;
    let lo = 1;
    let hi = Math.min(str.length - pos, SYNC_ITEM_BYTES);
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (storedSize(key, str.slice(pos, pos + mid)) <= SYNC_ITEM_BYTES) lo = mid; else hi = mid - 1;
    }
    let next = pos + lo;
    if (next < str.length && isHighSurrogate(str.charCodeAt(next - 1))) next--;   // never split a surrogate pair
    if (next <= pos) next = pos + 2;
    chunks.push(str.slice(pos, next));
    pos = next;
  }
  return chunks;
}

function chunksStoredSize(chunks) {
  return chunks.reduce((sum, c, i) => sum + storedSize(`${SYNC_PREFIX}${i}`, c), 0);
}

/** Drop the oldest days until the serialized snapshot fits `maxChars` — one pass, no re-stringifying. */
function trimDays(snapshot, maxChars) {
  const keys = Object.keys(snapshot.days).sort();
  const sizes = keys.map((k) => k.length + JSON.stringify(snapshot.days[k]).length + 4);
  let total = JSON.stringify({ ...snapshot, days: {} }).length + sizes.reduce((a, b) => a + b, 0);
  let drop = 0;
  while (total > maxChars && drop < keys.length - 1) total -= sizes[drop++];
  if (!drop) return { snapshot, trimmed: 0 };
  const days = {};
  for (const k of keys.slice(drop)) days[k] = snapshot.days[k];
  return { snapshot: { ...snapshot, days }, trimmed: drop };
}

function encryptionOn(settings) {
  return !!(settings.backup.encrypt && settings.backup.passphrase);
}

/** Serialize (and optionally encrypt) a snapshot into the payload to transmit. */
async function buildPayload(settings, snapshot) {
  const encrypted = encryptionOn(settings);
  const payload = encrypted ? await encryptJSON(snapshot, settings.backup.passphrase) : snapshot;
  return { json: JSON.stringify(payload), encrypted };
}

export async function backupToSync() {
  const settings = await getSettings();
  const full = await exportAll();
  let budget = encryptionOn(settings) ? SYNC_ENCRYPTED_BUDGET : SYNC_PLAINTEXT_BUDGET;

  // Trim by raw size, then check the REAL stored size (escaping inflates it) and
  // tighten the budget until it fits the quota.
  let result = null;
  for (let attempt = 0; attempt < SYNC_MAX_ATTEMPTS && !result; attempt++) {
    const { snapshot, trimmed } = trimDays(full, budget);
    const { json, encrypted } = await buildPayload(settings, snapshot);
    const chunks = chunkForSync(json);
    const stored = chunksStoredSize(chunks);
    if (stored <= SYNC_TOTAL_BYTES) result = { chunks, trimmed, encrypted, bytes: json.length };
    else if (Object.keys(snapshot.days).length <= 1) break;
    else budget = Math.floor(budget * (SYNC_TOTAL_BYTES / stored) * 0.97);
  }
  if (!result) throw new Error('הגיבוי גדול מדי לסנכרון Google');
  const { chunks, trimmed, encrypted, bytes } = result;

  const old = await chrome.storage.sync.get(null);
  const oldKeys = Object.keys(old).filter((k) => k.startsWith(SYNC_PREFIX));
  if (oldKeys.length) await chrome.storage.sync.remove(oldKeys);

  const writes = {};
  chunks.forEach((c, i) => { writes[`${SYNC_PREFIX}${i}`] = c; });
  writes[SYNC_META] = { chunks: chunks.length, ts: Date.now(), trimmed, encrypted };
  await chrome.storage.sync.set(writes);
  return { chunks: chunks.length, trimmed, bytes, encrypted };
}

/** Fetch, reassemble, and (if needed) decrypt the sync backup — no import side effect. */
async function fetchSyncSnapshot(passphrase) {
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
  let snapshot;
  try {
    snapshot = JSON.parse(json);
  } catch {
    throw new Error('הגיבוי בענן פגום (תוכן לא תקין)');
  }
  const wasEncrypted = isEncrypted(snapshot);
  if (wasEncrypted) {
    const pass = passphrase || (await getSettings()).backup.passphrase;
    if (!pass) { const e = new Error('הגיבוי מוצפן — נדרשת סיסמה'); e.code = 'ENCRYPTED'; throw e; }
    snapshot = await decryptJSON(snapshot, pass);
  }
  return { snapshot, meta, wasEncrypted };
}

/**
 * Fetch + decrypt the cloud backup and summarize it, WITHOUT importing —
 * lets the UI show what a restore would do (day range, total time, site count,
 * encrypted y/n) before the user commits to replace/merge.
 */
export async function peekSync({ passphrase } = {}) {
  const { snapshot, meta, wasEncrypted } = await fetchSyncSnapshot(passphrase);
  return { ...summarizeSnapshot(snapshot), encrypted: wasEncrypted, ts: meta.ts };
}

export async function restoreFromSync({ mode = 'replace', passphrase } = {}) {
  const { snapshot, meta } = await fetchSyncSnapshot(passphrase);
  const { days, domainsChanged } = await importAll(snapshot, { mode, includeSettings: true });
  return { days, domainsChanged, ts: meta.ts };
}

export async function backupToEndpoint(url, token) {
  if (!/^https:\/\//i.test(url)) throw new Error('כתובת השרת חייבת להתחיל ב-https://');
  const settings = await getSettings();
  const { json } = await buildPayload(settings, await exportAll());
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
