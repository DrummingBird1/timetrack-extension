// Validation of everything that enters storage from outside: a JSON export, a cloud backup, a
// CSV-built snapshot. Pure functions (no chrome, no DOM) so they are trivially testable.
//
// The rule is "keep what is well-formed, drop the rest and say how much": a file with a few bad
// rows still imports, a file that is not a backup at all is refused, and nothing malformed ever
// reaches the day records the tracker later adds to (a malformed "today" used to make every
// commit throw).

import { isTrackableHost } from './utils.js';
import { CATEGORY_DEFS } from './categories.js';
import { SUPPORTED_LANGS } from './i18n.js';

const MAX_DAY_SECONDS = 100000;        // a day is 86,400 s (90,000 on a DST day); one domain can't exceed it
const MAX_HOUR_SECONDS = 7200;
const MAX_SESSIONS_PER_DAY = 20000;
const FOCUS_LOG_MAX = 300;

/** @param {unknown} v @returns {v is Record<string, any>} */
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
/** @param {unknown} v @param {number} max */
const isNum = (v, max) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max;

/** "2026-03-05" and a real calendar day (no 2026-02-31). */
export function isDayKey(key) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key));
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (y < 1970 || y > 2200) return false;
  const date = new Date(y, mo - 1, d);
  return date.getFullYear() === y && date.getMonth() === mo - 1 && date.getDate() === d;
}

/** One day record → a clean one, or null when it is not a day record at all. */
function cleanDay(raw) {
  if (!isObj(raw) || !isObj(raw.domains)) return null;
  const domains = {};
  let dropped = 0;
  for (const [domain, rec] of Object.entries(raw.domains)) {
    if (!isTrackableHost(domain) || !isObj(rec) || !isNum(rec.t, MAX_DAY_SECONDS)) { dropped++; continue; }
    const out = { t: rec.t, v: isNum(rec.v, 1e6) ? rec.v : 0 };
    if (isObj(rec.dh)) {
      const dh = {};
      for (const [hour, secs] of Object.entries(rec.dh)) if (/^(?:\d|1\d|2[0-3])$/.test(hour) && isNum(secs, MAX_HOUR_SECONDS)) dh[hour] = secs;
      if (Object.keys(dh).length) out.dh = dh;
    }
    domains[domain] = out;
  }
  // The day-level hours: take the given array when it is 24 valid numbers, otherwise rebuild it from the per-site hours.
  let hours;
  if (Array.isArray(raw.hours) && raw.hours.length === 24 && raw.hours.every((h) => isNum(h, MAX_DAY_SECONDS))) {
    hours = raw.hours.slice();
  } else {
    hours = new Array(24).fill(0);
    for (const rec of Object.values(domains)) for (const [h, s] of Object.entries(rec.dh || {})) hours[Number(h)] += s;
  }
  return { day: { domains, hours }, dropped };
}

function cleanSessions(raw, validDays) {
  const out = {};
  if (!isObj(raw)) return out;
  for (const [key, list] of Object.entries(raw)) {
    if (!validDays.has(key) || !Array.isArray(list)) continue;
    const clean = list
      .filter((e) => Array.isArray(e) && isTrackableHost(e[0]) && isNum(e[1], 86400) && isNum(e[2], 86400) && e[2] > 0)
      .slice(0, MAX_SESSIONS_PER_DAY)
      .map((e) => [e[0], e[1], e[2]]);
    if (clean.length) out[key] = clean;
  }
  return out;
}

function cleanFocusLog(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((e) => isObj(e) && isNum(e.start, 1e15) && isNum(e.end, 1e15) && isNum(e.cycles, 1000) && isNum(e.completedCycles, 1000) && isNum(e.workedMs, 1e10))
    .map((e) => ({ start: e.start, end: e.end, cycles: e.cycles, completedCycles: e.completedCycles, workedMs: e.workedMs, endedEarly: !!e.endedEarly }))
    .slice(-FOCUS_LOG_MAX);
}

const THEMES = ['auto', 'dark', 'light'];
const SCHEDULE_TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Domains / categories / schedule entries, filtered by what each list holds. */
function cleanList(path, list) {
  if (!Array.isArray(list)) return undefined;
  if (path === 'focus.schedule') {
    return list
      .filter((s) => isObj(s) && Array.isArray(s.days) && s.days.length && s.days.every((d) => Number.isInteger(d) && d >= 0 && d <= 6) && SCHEDULE_TIME.test(s.time) && isNum(s.minutes, 1440) && s.minutes > 0)
      .map((s) => ({ days: [...new Set(s.days)], time: s.time, minutes: s.minutes }));
  }
  if (/Categories$/.test(path)) return list.filter((c) => typeof c === 'string' && c in CATEGORY_DEFS);
  return list.filter((d) => isTrackableHost(d));
}

/** A settings value of the same type as its default, or undefined when it does not qualify. */
function coerce(path, value, def) {
  if (path === 'language') return SUPPORTED_LANGS.includes(value) ? value : undefined;
  if (path === 'theme') return THEMES.includes(value) ? value : undefined;
  if (path === 'focus.mode') return value === 'block' || value === 'allow' ? value : undefined;
  if (path === 'weekStart') return Number.isInteger(value) && value >= 0 && value <= 6 ? value : undefined;
  if (path === 'retentionDays') return value === 0 || (Number.isInteger(value) && value >= 7 && value <= 3650) ? value : undefined;
  if (typeof def === 'boolean') return typeof value === 'boolean' ? value : undefined;
  if (typeof def === 'number') return isNum(value, 1e6) ? value : undefined;
  if (typeof def === 'string') return typeof value === 'string' && value.length <= 500 ? value : undefined;
  if (Array.isArray(def)) return cleanList(path, value);
  if (isObj(def) && Object.keys(def).length === 0) {            // the three free-form maps
    if (!isObj(value)) return undefined;
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (path === 'categoryBudgets') { if (k in CATEGORY_DEFS && isNum(v, 10080) && v > 0) out[k] = v; }
      else if (path === 'siteLimits') { if (isTrackableHost(k) && isNum(v, 1440) && v > 0) out[k] = v; }
      else if (isTrackableHost(k) && typeof v === 'string' && v in CATEGORY_DEFS) out[k] = v;   // categoryMap
    }
    return out;
  }
  if (isObj(def)) {                                              // the focus sub-object
    if (!isObj(value)) return undefined;
    const out = {};
    for (const [k, d] of Object.entries(def)) {
      if (!(k in value)) continue;
      const v = coerce(`${path}.${k}`, value[k], d);
      if (v !== undefined) out[k] = v;
    }
    return out;
  }
  return undefined;
}

/**
 * The importable part of a snapshot's settings: only known keys, of the right type and in range.
 * `backup` is never taken from a file: it holds where this device sends its data, and a file
 * from someone else must not be able to change that (the credentials never travel in snapshots anyway).
 * @param {unknown} raw
 * @param {Record<string, any>} defaults  DEFAULT_SETTINGS
 */
export function sanitizeSettings(raw, defaults) {
  const out = {};
  if (!isObj(raw)) return out;
  for (const [key, def] of Object.entries(defaults)) {
    if (key === 'backup' || !(key in raw)) continue;
    const v = coerce(key, raw[key], def);
    if (v !== undefined) out[key] = v;
  }
  return out;
}

/**
 * Validate a snapshot before anything is written. Returns the clean parts and how many records were dropped.
 * Throws an Error with code 'BAD_SNAPSHOT' when it is not a backup file at all.
 * @param {unknown} raw
 * @param {Record<string, any>} defaults  DEFAULT_SETTINGS
 */
export function sanitizeSnapshot(raw, defaults) {
  if (!isObj(raw) || !isObj(raw.days)) throw Object.assign(new Error('not a TimeTrack backup'), { code: 'BAD_SNAPSHOT' });
  const days = {};
  let dropped = 0;
  for (const [key, rawDay] of Object.entries(raw.days)) {
    const cleaned = isDayKey(key) ? cleanDay(rawDay) : null;
    if (!cleaned) { dropped++; continue; }
    days[key] = cleaned.day;
    dropped += cleaned.dropped;
  }
  const keys = new Set(Object.keys(days));
  return {
    days,
    sessions: cleanSessions(raw.sessions, keys),
    focusLog: Array.isArray(raw.focusLog) ? cleanFocusLog(raw.focusLog) : null,
    settings: isObj(raw.settings) ? sanitizeSettings(raw.settings, defaults) : null,
    dropped,
  };
}
