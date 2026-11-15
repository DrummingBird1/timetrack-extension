// Backup integrity (snapshot v2): a checksum over the day records so a backup can be verified
// without restoring it, and pure helpers to restore only part of one. No chrome.* here.
import { sanitizeSnapshot, isDayKey } from './snapshot.js';

/** JSON with object keys sorted, so the same data always produces the same text. */
export function canonicalJSON(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJSON).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonicalJSON(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

async function sha256Hex(text) {
  const bytes = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Totals that travel with a backup: how many days, how many tracked seconds, and a SHA-256 of the days. */
export async function describeIntegrity(days) {
  let seconds = 0;
  for (const day of Object.values(days || {})) {
    for (const rec of Object.values(day.domains || {})) seconds += rec.t || 0;
  }
  return { days: Object.keys(days || {}).length, seconds, sha: await sha256Hex(canonicalJSON(days || {})) };
}

/**
 * Check a backup without restoring it.
 * checksum: 'match' | 'mismatch' | 'none' (older backups carry no checksum).
 * ok is true only when nothing was found wrong; `dropped` counts records the importer would refuse.
 * @returns {Promise<{ ok: boolean, checksum: 'match'|'mismatch'|'none', days: number, dropped: number, problems: string[] }>}
 */
export async function verifySnapshot(snapshot, defaults = {}) {
  const problems = [];
  let clean;
  try {
    clean = sanitizeSnapshot(snapshot, defaults);
  } catch {
    return { ok: false, checksum: 'none', days: 0, dropped: 0, problems: ['not-a-backup'] };
  }
  /** @type {'match'|'mismatch'|'none'} */
  let checksum = 'none';
  const claimed = snapshot && snapshot.integrity;
  if (claimed && typeof claimed.sha === 'string') {
    const actual = await describeIntegrity(snapshot.days);
    checksum = actual.sha === claimed.sha && actual.days === claimed.days ? 'match' : 'mismatch';
    if (checksum === 'mismatch') problems.push('checksum');
  }
  if (clean.dropped) problems.push('invalid-records');
  return { ok: problems.length === 0, checksum, days: Object.keys(clean.days).length, dropped: clean.dropped, problems };
}

/**
 * A copy of the snapshot limited to a day range (inclusive, YYYY-MM-DD; either end may be empty).
 * Settings are left out — a range restore is about history only.
 */
export function filterSnapshotRange(snapshot, { from = '', to = '' } = {}) {
  const inRange = (key) => isDayKey(key) && (!from || key >= from) && (!to || key <= to);
  const pick = (obj) => Object.fromEntries(Object.entries(obj || {}).filter(([k]) => inRange(k)));
  const out = { ...snapshot, days: pick(snapshot && snapshot.days), sessions: pick(snapshot && snapshot.sessions) };
  delete out.settings;
  delete out.focusLog;
  delete out.integrity;
  return out;
}
