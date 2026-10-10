// Cloud backup strategies:
//   1. chrome.storage.sync  — zero-config, rides Google account sync. The snapshot is gzip-compressed
//      (then optionally encrypted) and chunked to respect the ~8KB-per-item / ~100KB-total quota;
//      if even compressed it doesn't fit, the oldest days are left out of the sync copy.
//   2. Custom REST endpoint — POST the snapshot to an HTTPS URL the user controls.
// Either target can be end-to-end encrypted with a passphrase (see crypto.js):
// the server / sync only store ciphertext. File export/import lives in storage.js.

import { exportAll, importAll, getSettings, saveSettings, summarizeSnapshot } from './storage.js';
import { encryptJSON, decryptJSON, isEncrypted } from './crypto.js';
import { gzip, packJSON, unpackJSON, isPacked } from './compress.js';

const SYNC_PREFIX = 'ttt_sync_';
const SYNC_META = 'ttt_sync_meta';
// chrome.storage.sync quotas are measured on the STORED form: key + JSON.stringify(value),
// in UTF-8 bytes. A chunk of serialized JSON is full of `"` characters that stringify to
// `\"`, so N characters can cost ~1.3N bytes — sizing by character count (as we once did)
// overflowed the per-item quota on any realistic history.
const SYNC_ITEM_BYTES = 8000;          // per-item budget (quota: 8192)
const SYNC_TOTAL_BYTES = 96000;        // all chunks together (quota: 102400; leaves room for the meta item)
const SYNC_MAX_ATTEMPTS = 8;
// Estimating the packed size without encrypting every time (PBKDF2 is slow): the JSON around the
// base64 payload, and the per-item key/quote overhead. Deliberately generous — the real size is
// measured after packing and the fit is tightened if the estimate was optimistic.
const PLAIN_WRAPPER_BYTES = 120;
const ENCRYPTED_WRAPPER_BYTES = 420;
const CHUNK_OVERHEAD_BYTES = 24;

const utf8 = new TextEncoder();
const storedSize = (key, value) => utf8.encode(key).length + utf8.encode(JSON.stringify(value)).length;
const isHighSurrogate = (code) => code >= 0xD800 && code <= 0xDBFF;
const base64Length = (bytes) => Math.ceil(bytes / 3) * 4;

async function sha256Hex(str) {
  const digest = await crypto.subtle.digest('SHA-256', utf8.encode(str));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

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

function encryptionOn(settings) {
  return !!(settings.backup.encrypt && settings.backup.passphrase);
}

/** Serialize (and optionally encrypt) a snapshot into the payload to transmit to a custom endpoint. */
async function buildPayload(settings, snapshot) {
  const encrypted = encryptionOn(settings);
  const payload = encrypted ? await encryptJSON(snapshot, settings.backup.passphrase) : snapshot;
  return { json: JSON.stringify(payload), encrypted };
}

/** The sync payload: compressed, then (optionally) encrypted. Compressing ciphertext would do nothing. */
async function buildSyncPayload(settings, snapshot) {
  const encrypted = encryptionOn(settings);
  const payload = encrypted
    ? await encryptJSON(snapshot, settings.backup.passphrase, { gzip: true })
    : await packJSON(snapshot);
  return { json: JSON.stringify(payload), encrypted };
}

/** The snapshot restricted to its newest `n` days. */
function newestDays(snapshot, n) {
  const keys = Object.keys(snapshot.days).sort();
  const days = {};
  for (const k of keys.slice(Math.max(0, keys.length - n))) days[k] = snapshot.days[k];
  return { ...snapshot, days };
}

/** Estimated stored size of a snapshot once compressed (and encrypted) for sync. */
async function estimateSyncSize(snapshot, encrypted) {
  const gz = await gzip(utf8.encode(JSON.stringify(snapshot)));
  const payload = encrypted
    ? ENCRYPTED_WRAPPER_BYTES + base64Length(gz.length + 16)    // + AES-GCM tag
    : PLAIN_WRAPPER_BYTES + base64Length(gz.length);
  return payload + Math.ceil(payload / SYNC_ITEM_BYTES) * CHUNK_OVERHEAD_BYTES;
}

/** How many of the newest days fit the quota (estimate; backupToSync verifies the real size). */
async function daysThatFit(snapshot, encrypted) {
  const total = Object.keys(snapshot.days).length;
  if (await estimateSyncSize(snapshot, encrypted) <= SYNC_TOTAL_BYTES) return total;
  let lo = Math.min(1, total);
  let hi = total;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (await estimateSyncSize(newestDays(snapshot, mid), encrypted) <= SYNC_TOTAL_BYTES) lo = mid; else hi = mid - 1;
  }
  return lo;
}

export async function backupToSync() {
  const settings = await getSettings();
  const full = await exportAll({ sessions: false });   // session logs would not fit the 100 KB quota
  const totalDays = Object.keys(full.days).length;

  // Pick how many days fit (estimated), then pack for real and check the actual stored size;
  // if the estimate was optimistic, keep fewer days and try again.
  let keep = await daysThatFit(full, encryptionOn(settings));
  let result = null;
  for (let attempt = 0; attempt < SYNC_MAX_ATTEMPTS && !result; attempt++) {
    const snapshot = newestDays(full, keep);
    const { json, encrypted } = await buildSyncPayload(settings, snapshot);
    const chunks = chunkForSync(json);
    const stored = chunksStoredSize(chunks);
    if (stored <= SYNC_TOTAL_BYTES) result = { chunks, json, encrypted, days: keep, rawBytes: JSON.stringify(snapshot).length };
    else if (keep <= 1) break;
    else keep = Math.max(1, Math.min(keep - 1, Math.floor(keep * (SYNC_TOTAL_BYTES / stored) * 0.97)));
  }
  if (!result) throw new Error('הגיבוי גדול מדי לסנכרון Google');
  const { chunks, json, encrypted, days, rawBytes } = result;
  const trimmed = totalDays - days;

  // Write the new copy over the old one in a single set() (it is all-or-nothing), THEN drop leftover
  // chunks — a failed backup must never cost the user the previous one. Only when the old and new
  // copies don't fit the quota together do we free the old copy first.
  const writes = {};
  chunks.forEach((c, i) => { writes[`${SYNC_PREFIX}${i}`] = c; });
  writes[SYNC_META] = { chunks: chunks.length, ts: Date.now(), trimmed, days, encrypted, gzip: true, sha: await sha256Hex(json) };
  const oldKeys = Object.keys(await chrome.storage.sync.get(null)).filter((k) => k.startsWith(SYNC_PREFIX));
  try {
    await chrome.storage.sync.set(writes);
  } catch (e) {
    if (!/quota/i.test(String(e && e.message))) throw e;
    if (oldKeys.length) await chrome.storage.sync.remove(oldKeys);
    await chrome.storage.sync.set(writes);
  }
  const stale = oldKeys.filter((k) => !(k in writes));
  if (stale.length) await chrome.storage.sync.remove(stale);
  return { chunks: chunks.length, trimmed, days, bytes: json.length, rawBytes, encrypted };
}

/**
 * Fetch, reassemble, and (if needed) decrypt/decompress the sync backup — no import side effect.
 * Understands every format this extension ever wrote: plain snapshot, encrypted envelope,
 * compressed wrapper, compressed + encrypted envelope.
 * @param {string} [passphrase]
 */
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
  // Another device's write reaches this one item by item, so a restore can catch a mix of two backups.
  if (meta.sha && (await sha256Hex(json)) !== meta.sha) {
    throw new Error('הגיבוי בענן פגום או שהסנכרון עדיין לא הסתיים — נסה שוב בעוד דקה');
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
    if (!pass) { const e = /** @type {Error & { code?: string }} */ (new Error('הגיבוי מוצפן — נדרשת סיסמה')); e.code = 'ENCRYPTED'; throw e; }
    snapshot = await decryptJSON(snapshot, pass);       // also inflates when the envelope says zip: 'gzip'
  } else if (isPacked(snapshot)) {
    try {
      snapshot = await unpackJSON(snapshot);
    } catch {
      throw new Error('הגיבוי בענן פגום (תוכן לא תקין)');
    }
  }
  return { snapshot, meta, wasEncrypted };
}

/**
 * Fetch + decrypt the cloud backup and summarize it, WITHOUT importing —
 * lets the UI show what a restore would do (day range, total time, site count,
 * encrypted y/n) before the user commits to replace/merge.
 * @param {{ passphrase?: string }} [opts]
 */
export async function peekSync({ passphrase } = {}) {
  const { snapshot, meta, wasEncrypted } = await fetchSyncSnapshot(passphrase);
  return { ...summarizeSnapshot(snapshot), encrypted: wasEncrypted, ts: meta.ts };
}

/** @param {{ mode?: string, passphrase?: string }} [opts] */
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
