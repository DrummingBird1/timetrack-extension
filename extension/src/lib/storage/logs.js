// Focus log and the optional per-day session logs.
// Part of the persistence layer; import from ../storage.js (the facade).

import { K, SESS_PREFIX } from './keys.js';

// ---- focus session history ----
// One entry per finished or early-ended session: { start, end, cycles, completedCycles,
// workedMs, endedEarly }. Capped so it can never grow without bound.
export const FOCUS_LOG_MAX = 300;

export async function getFocusLog() {
  return (await chrome.storage.local.get(K.FOCUS_LOG))[K.FOCUS_LOG] || [];
}

export async function addFocusLog(entry) {
  const list = await getFocusLog();
  list.push(entry);
  await chrome.storage.local.set({ [K.FOCUS_LOG]: list.slice(-FOCUS_LOG_MAX) });
}

export async function clearFocusLog() {
  await chrome.storage.local.remove(K.FOCUS_LOG);
}

// ---- session log (opt-in) ----
// One array per day: [domain, startSec, seconds] where startSec counts from local
// midnight. Kept apart from the day aggregates so the always-on write path stays small.
const SESSION_GAP_SECONDS = 5;   // segments closer than this belong to the same visit

/**
 * Record `seconds` spent on `domain` starting at `startSec`. The worker commits an
 * open segment at least every minute, so a segment that begins where the last
 * session for that domain ended extends it instead of starting a new one.
 */
export async function recordSession({ dateKey, domain, startSec, seconds }) {
  if (!domain || !(seconds > 0)) return;
  const key = K.sess(dateKey);
  const list = (await chrome.storage.local.get(key))[key] || [];
  const last = list[list.length - 1];
  if (last && last[0] === domain && startSec - (last[1] + last[2]) <= SESSION_GAP_SECONDS && startSec >= last[1]) {
    last[2] = Math.max(last[2], Math.round(startSec + seconds - last[1]));
  } else {
    list.push([domain, Math.round(startSec), Math.round(seconds)]);
  }
  await chrome.storage.local.set({ [key]: list });
}

/** Session logs for the given day keys; days that have none are absent from the result. */
export async function getSessions(keys) {
  if (!keys.length) return {};
  const r = await chrome.storage.local.get(keys.map(K.sess));
  const out = {};
  for (const key of keys) if (r[K.sess(key)]) out[key] = r[K.sess(key)];
  return out;
}

/** Delete every session log (tracked time is untouched). Returns how many days had one. */
export async function clearSessions() {
  const all = await chrome.storage.local.get(null);
  const keys = Object.keys(all).filter((k) => k.startsWith(SESS_PREFIX));
  if (keys.length) await chrome.storage.local.remove(keys);
  return keys.length;
}
