// Day records, the day index and meta: reading and the tracking commits.
// Part of the persistence layer; import from ../storage.js (the facade).

import { K, SCHEMA_VERSION } from './keys.js';

export async function getIndex() {
  const r = await chrome.storage.local.get(K.INDEX);
  return r[K.INDEX] || [];
}

export async function getMeta() {
  const r = await chrome.storage.local.get(K.META);
  return r[K.META] || { version: SCHEMA_VERSION, firstDay: null, installedAt: 0 };
}

export async function saveMeta(patch) {
  const meta = await getMeta();
  const next = { ...meta, ...patch };
  await chrome.storage.local.set({ [K.META]: next });
  return next;
}

export function emptyDay() {
  return { domains: {}, hours: new Array(24).fill(0) };
}

export async function getDay(key) {
  const r = await chrome.storage.local.get(K.day(key));
  return r[K.day(key)] || null;
}

export async function getDays(keys) {
  if (!keys.length) return {};
  const storeKeys = keys.map(K.day);
  const r = await chrome.storage.local.get(storeKeys);
  const out = {};
  for (const key of keys) {
    const d = r[K.day(key)];
    if (d) out[key] = d;
  }
  return out;
}

/**
 * Accumulate active seconds for a domain at a given hour-of-day. In addition to
 * the day-level `hours[24]`, we keep a sparse per-domain hourly map `dh` (schema
 * v2) so the per-site drill-down can show a site's busiest hour, not just day.
 */
export async function addTime({ dateKey, domain, seconds, hour }) {
  if (!domain || seconds <= 0) return;
  const day = (await getDay(dateKey)) || emptyDay();
  const rec = domainRecord(day, domain);
  rec.t += seconds;
  if (hour >= 0 && hour < 24) {
    day.hours[hour] = (day.hours[hour] || 0) + seconds;
    if (!rec.dh) rec.dh = {};
    rec.dh[hour] = (rec.dh[hour] || 0) + seconds;
  }
  await commitDay(dateKey, day);
}

/** Register a fresh visit (a switch into this domain). */
export async function addVisit(dateKey, domain) {
  if (!domain) return;
  const day = (await getDay(dateKey)) || emptyDay();
  domainRecord(day, domain).v += 1;
  await commitDay(dateKey, day);
}

/** The record for `domain`, created when missing. Own properties only: a host called "constructor" must not hit Object.prototype. */
function domainRecord(day, domain) {
  if (!Object.hasOwn(day.domains, domain)) day.domains[domain] = { t: 0, v: 0 };
  return day.domains[domain];
}

/**
 * Write a day record and, when the day is new, the index entry in ONE set() call (it is
 * all-or-nothing). Writing them separately left an orphan day, missing from export and backup,
 * if the worker died between the two writes.
 */
async function commitDay(dateKey, day) {
  const writes = { [K.day(dateKey)]: day };
  const idx = await getIndex();
  const isNew = !idx.includes(dateKey);
  if (isNew) writes[K.INDEX] = [...idx, dateKey].sort();
  await chrome.storage.local.set(writes);
  if (isNew) {
    const meta = await getMeta();
    if (!meta.firstDay) await saveMeta({ firstDay: dateKey });
  }
}
