// Persistence layer. Data is stored one record per day under `ttt_day_<key>`
// so each tracking commit only rewrites a small object, with a separate
// `ttt_index` listing the days that exist.

import { dayKey } from './utils.js';

// v2: per-domain hourly map `dh`.  v3: optional per-day session logs (ttt_sess_<day>).
// Both are additive — old records need no rewrite.
export const SCHEMA_VERSION = 3;

export const K = {
  SETTINGS: 'ttt_settings',
  INDEX: 'ttt_index',
  META: 'ttt_meta',
  day: (key) => `ttt_day_${key}`,
  sess: (key) => `ttt_sess_${key}`,
};
const SESS_PREFIX = 'ttt_sess_';

export const DEFAULT_SETTINGS = {
  enabled: true,
  theme: 'auto',                 // auto | dark | light
  language: 'he',                // he | en (UI language)
  idleSeconds: 60,               // pause tracking after this much inactivity
  countAudibleBackground: false, // keep counting if the tab is playing audio
  groupSubdomains: true,         // foo.example.com -> example.com
  weekStart: 0,                  // 0 = Sunday, 1 = Monday
  retentionDays: 365,            // auto-delete data older than this
  dailyGoalMinutes: 0,           // daily focus goal (0 = off) — informational
  weeklyGoalMinutes: 0,          // weekly focus goal (0 = off)
  dailyLimitMinutes: 0,          // total-time limit alert (0 = off)
  siteLimits: {},                // domain -> minutes/day
  categoryBudgets: {},           // category -> minutes/week (notifies at 80% and 100%)
  notifyLimits: true,            // fire notifications when limits are hit
  weeklySummary: true,           // weekly digest notification
  categoryMap: {},               // domain -> category override
  blacklist: [],                 // domains never tracked
  pinnedSites: [],                // domains pinned to the top of the Sites table
  realFavicons: false,           // use Chrome's local _favicon icons (opt-in perm)
  sessionLog: false,             // also record each visit's start + length (opt-in; powers session-length stats)
  focus: {
    defaultMinutes: 25,                          // suggested work length
    breakMinutes: 5,                             // Pomodoro break length
    longBreakMinutes: 0,                         // longer break every N cycles (0 = off)
    longBreakEvery: 4,                           // take the long break every N work cycles
    cycles: 1,                                   // work/break cycles (1 = single)
    mode: 'block',                               // 'block' | 'allow' (allowlist)
    blockCategories: ['social', 'entertainment'], // categories blocked in block mode
    blockDomains: [],                            // extra domains always blocked
    allowCategories: ['productivity', 'reference', 'communication'], // allowed in allow mode
    allowDomains: [],                            // extra domains always allowed
  },
  backup: {
    syncEnabled: false,          // mirror into chrome.storage.sync
    endpointUrl: '',             // optional custom REST backup endpoint
    endpointToken: '',           // bearer token for the endpoint
    encrypt: false,              // encrypt the backup payload with a passphrase
    passphrase: '',              // local-only; never transmitted in clear
    autoIntervalHours: 24,
    lastBackup: 0,
    lastBackupStatus: '',
  },
};

function deepMerge(base, patch) {
  if (Array.isArray(patch)) return patch.slice();
  if (patch && typeof patch === 'object') {
    const out = { ...(base && typeof base === 'object' ? base : {}) };
    for (const k of Object.keys(patch)) out[k] = deepMerge(base ? base[k] : undefined, patch[k]);
    return out;
  }
  return patch;
}

export async function getSettings() {
  const r = await chrome.storage.local.get(K.SETTINGS);
  return deepMerge(DEFAULT_SETTINGS, r[K.SETTINGS] || {});
}

// Every settings write is read-modify-write. Serializing them stops two quick edits
// (a toggle and a number field, say) from overwriting each other with a stale copy.
// Code that already holds the lock must use the *Unlocked helpers — re-entering would deadlock.
let settingsChain = /** @type {Promise<any>} */ (Promise.resolve());
/**
 * @template T
 * @param {() => Promise<T>} fn
 * @returns {Promise<T>}
 */
function withSettingsLock(fn) {
  const run = settingsChain.then(fn);
  settingsChain = run.catch(() => {});
  return run;
}

async function writeSettingsUnlocked(next) {
  await chrome.storage.local.set({ [K.SETTINGS]: next });
  return next;
}

/**
 * Settings whose value is a plain object used as a map (domain -> value). deepMerge
 * can only ADD or OVERWRITE keys it sees in a patch — a patch built by deleting a key
 * locally leaves the old key untouched in storage (arrays don't have this problem:
 * deepMerge replaces them wholesale). That bit category-mapping removal and
 * site-limit clearing before it was caught, so these two can no longer go through
 * saveSettings() at all: use setSettingsMapEntry / removeSettingsMapEntry.
 */
export const MAP_SETTINGS = ['categoryMap', 'siteLimits', 'categoryBudgets'];

export async function saveSettings(patch) {
  const mapKey = MAP_SETTINGS.find((k) => patch && k in patch);
  if (mapKey) {
    throw new Error(`saveSettings() cannot edit the map setting "${mapKey}" (deepMerge can't delete keys) — use setSettingsMapEntry() / removeSettingsMapEntry()`);
  }
  return withSettingsLock(async () => writeSettingsUnlocked(deepMerge(await getSettings(), patch)));
}

/**
 * Replace one top-level settings key with an exact value, bypassing deepMerge's
 * add/update-only recursion for that key. For map settings prefer the entry helpers
 * below; this is the escape hatch for replacing a whole value.
 */
export async function saveSettingsKey(key, value) {
  return withSettingsLock(async () => writeSettingsUnlocked({ ...(await getSettings()), [key]: value }));
}

async function editMapSetting(key, edit) {
  if (!MAP_SETTINGS.includes(key)) throw new Error(`"${key}" is not a map setting (${MAP_SETTINGS.join(', ')})`);
  return withSettingsLock(async () => {
    const current = await getSettings();
    const map = { ...current[key] };
    edit(map);
    return writeSettingsUnlocked({ ...current, [key]: map });
  });
}

/** Add or replace one entry of a map setting (categoryMap / siteLimits). */
export function setSettingsMapEntry(key, entryKey, value) {
  return editMapSetting(key, (map) => { map[entryKey] = value; });
}

/** Delete one entry of a map setting. Deleting a missing entry is a no-op. */
export function removeSettingsMapEntry(key, entryKey) {
  return editMapSetting(key, (map) => { delete map[entryKey]; });
}

export async function getIndex() {
  const r = await chrome.storage.local.get(K.INDEX);
  return r[K.INDEX] || [];
}

async function ensureIndexed(key) {
  const idx = await getIndex();
  if (!idx.includes(key)) {
    idx.push(key);
    idx.sort();
    await chrome.storage.local.set({ [K.INDEX]: idx });
    const meta = await getMeta();
    if (!meta.firstDay) await saveMeta({ firstDay: key });
  }
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

function emptyDay() {
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
  const rec = day.domains[domain] || (day.domains[domain] = { t: 0, v: 0 });
  rec.t += seconds;
  if (hour >= 0 && hour < 24) {
    day.hours[hour] = (day.hours[hour] || 0) + seconds;
    if (!rec.dh) rec.dh = {};
    rec.dh[hour] = (rec.dh[hour] || 0) + seconds;
  }
  await chrome.storage.local.set({ [K.day(dateKey)]: day });
  await ensureIndexed(dateKey);
}

/** Register a fresh visit (a switch into this domain). */
export async function addVisit(dateKey, domain) {
  if (!domain) return;
  const day = (await getDay(dateKey)) || emptyDay();
  if (!day.domains[domain]) day.domains[domain] = { t: 0, v: 0 };
  day.domains[domain].v += 1;
  await chrome.storage.local.set({ [K.day(dateKey)]: day });
  await ensureIndexed(dateKey);
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

export async function pruneOld(retentionDays) {
  if (!retentionDays || retentionDays <= 0) return 0;
  const idx = await getIndex();
  const cutoff = dayKey(new Date(Date.now() - retentionDays * 86400000));
  const remove = idx.filter((k) => k < cutoff);
  if (!remove.length) return 0;
  await chrome.storage.local.remove([...remove.map(K.day), ...remove.map(K.sess)]);
  const kept = idx.filter((k) => k >= cutoff);
  await chrome.storage.local.set({ [K.INDEX]: kept });
  return remove.length;
}

export async function clearAllData() {
  const idx = await getIndex();
  await chrome.storage.local.remove(idx.map(K.day));
  await clearSessions();
  await chrome.storage.local.set({ [K.INDEX]: [] });
  await saveMeta({ firstDay: null });
}

/**
 * Credentials stored in settings.backup. They live on this device only: a
 * snapshot (file export, cloud backup, custom endpoint) must never carry them,
 * or a plaintext export would hand the passphrase / bearer token to whoever
 * receives the file.
 */
function stripSecrets(settings) {
  return { ...settings, backup: { ...settings.backup, passphrase: '', endpointToken: '' } };
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
  const meta = await getMeta();
  const snapshot = {
    app: 'TimeTrack',
    version: SCHEMA_VERSION,
    exportedAt: Date.now(),
    meta,
    settings,
    days,
  };
  if (sessions) {
    const logs = await getSessions(idx);
    if (Object.keys(logs).length) snapshot.sessions = logs;
  }
  return snapshot;
}

/**
 * Restore a snapshot. mode "replace" wipes existing days first; "merge" keeps
 * the larger time/visits per domain so re-importing never double counts.
 * Returns { days, domainsChanged }: domainsChanged counts domain-day records
 * whose merged value actually differs from what was already stored (null in
 * "replace" mode, where the concept of a "conflict" doesn't apply — everything
 * is wiped first).
 */
export async function importAll(snapshot, { mode = 'merge', includeSettings = true } = {}) {
  if (!snapshot || typeof snapshot !== 'object' || !snapshot.days) {
    throw new Error('קובץ גיבוי לא תקין');
  }
  if (includeSettings && snapshot.settings) {
    await withSettingsLock(async () => {
      const local = await getSettings();
      const merged = deepMerge(DEFAULT_SETTINGS, snapshot.settings);
      // Snapshots carry no credentials, so keep this device's own. (A legacy
      // snapshot that still has them wins — it is the user's own data.)
      merged.backup.passphrase = merged.backup.passphrase || local.backup.passphrase;
      merged.backup.endpointToken = merged.backup.endpointToken || local.backup.endpointToken;
      // "Encrypt backups" with no passphrase would be silently skipped by
      // backup.js — turn the flag off so the UI never claims protection it lacks.
      if (merged.backup.encrypt && !merged.backup.passphrase) merged.backup.encrypt = false;
      await writeSettingsUnlocked(merged);
    });
  }
  if (mode === 'replace') await clearAllData();

  const writes = {};
  const idx = new Set(await getIndex());
  const existing = await getDays(Object.keys(snapshot.days));
  let domainsChanged = 0;

  for (const [key, incoming] of Object.entries(snapshot.days)) {
    const base = existing[key] || emptyDay();
    if (mode === 'replace') {
      writes[K.day(key)] = incoming;
    } else {
      const { day, changed } = mergeDay(base, incoming);
      writes[K.day(key)] = day;
      domainsChanged += changed;
    }
    idx.add(key);
  }
  // Session logs: keep whichever side recorded more for a day, so re-importing the same
  // file never doubles entries (the same idempotence rule as the day aggregates).
  const incomingSessions = snapshot.sessions || {};
  const sessionKeys = Object.keys(incomingSessions);
  if (sessionKeys.length) {
    const existingSessions = await getSessions(sessionKeys);
    const total = (list) => (list || []).reduce((sum, e) => sum + (e[2] || 0), 0);
    for (const key of sessionKeys) {
      const keep = total(existingSessions[key]) >= total(incomingSessions[key]) ? existingSessions[key] : incomingSessions[key];
      if (keep && keep.length) writes[K.sess(key)] = keep;
    }
  }
  writes[K.INDEX] = [...idx].sort();
  await chrome.storage.local.set(writes);
  return { days: Object.keys(snapshot.days).length, domainsChanged: mode === 'merge' ? domainsChanged : null };
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
    const cur = out.domains[domain] || { t: 0, v: 0 };
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

/**
 * Combine one domain's entire history into another (e.g. a site rebranded) and
 * remove the old domain. Sums t/v/dh per day (these are two distinct domains
 * being combined, not a duplicate re-import of the same data — max-merging like
 * importAll would silently drop whichever domain has less time). Also migrates
 * categoryMap/siteLimits/blacklist/focus per-domain lists that reference the old
 * domain. Returns the number of day records touched.
 */
export async function mergeDomainAlias(oldDomain, newDomain) {
  if (!oldDomain || !newDomain || oldDomain === newDomain) return 0;
  const idx = await getIndex();
  const days = await getDays(idx);
  const writes = {};
  let touched = 0;
  const touchedKeys = [];

  for (const key of idx) {
    const day = days[key];
    const oldRec = day && day.domains && day.domains[oldDomain];
    if (!oldRec) continue;
    const newRec = day.domains[newDomain] || { t: 0, v: 0 };
    const merged = { t: (newRec.t || 0) + (oldRec.t || 0), v: (newRec.v || 0) + (oldRec.v || 0) };
    const dh = sumDh(newRec.dh, oldRec.dh);
    if (dh) merged.dh = dh;
    const nextDomains = { ...day.domains, [newDomain]: merged };
    delete nextDomains[oldDomain];
    writes[K.day(key)] = { ...day, domains: nextDomains };
    touched++;
    touchedKeys.push(key);
  }
  if (touched) await chrome.storage.local.set(writes);

  // Session logs name domains too; only days where the old domain had time can mention it.
  if (touchedKeys.length) {
    const logs = await getSessions(touchedKeys);
    const sessionWrites = {};
    for (const [key, list] of Object.entries(logs)) {
      if (list.some((e) => e[0] === oldDomain)) {
        sessionWrites[K.sess(key)] = list.map((e) => (e[0] === oldDomain ? [newDomain, e[1], e[2]] : e));
      }
    }
    if (Object.keys(sessionWrites).length) await chrome.storage.local.set(sessionWrites);
  }

  // Re-point every per-domain setting. An existing entry for the new domain wins.
  const settings = await getSettings();
  for (const mapKey of ['categoryMap', 'siteLimits']) {      // the domain-keyed maps (budgets are keyed by category)
    if (settings[mapKey][oldDomain] == null) continue;
    if (settings[mapKey][newDomain] == null) await setSettingsMapEntry(mapKey, newDomain, settings[mapKey][oldDomain]);
    await removeSettingsMapEntry(mapKey, oldDomain);
  }
  const rename = (list) => [...new Set(list.map((d) => (d === oldDomain ? newDomain : d)))];
  const patch = {};
  if (settings.blacklist.includes(oldDomain)) patch.blacklist = rename(settings.blacklist);
  if ((settings.pinnedSites || []).includes(oldDomain)) patch.pinnedSites = rename(settings.pinnedSites);
  for (const listKey of ['blockDomains', 'allowDomains']) {
    if ((settings.focus[listKey] || []).includes(oldDomain)) (patch.focus ||= {})[listKey] = rename(settings.focus[listKey]);
  }
  if (Object.keys(patch).length) await saveSettings(patch);

  return touched;
}

/** Sum (not max) two per-domain hourly maps — used when combining distinct domains. */
function sumDh(a = {}, b = {}) {
  const out = { ...a };
  for (const [h, v] of Object.entries(b)) out[h] = (out[h] || 0) + (v || 0);
  return Object.keys(out).length ? out : undefined;
}

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
];

export async function migrate() {
  const meta = await getMeta();
  const from = meta.version || 0;
  if (from >= SCHEMA_VERSION) {
    if (meta.version !== SCHEMA_VERSION) await saveMeta({ version: SCHEMA_VERSION });
    return { from, to: SCHEMA_VERSION, applied: 0 };
  }
  let applied = 0;
  for (const m of MIGRATIONS.sort((a, b) => a.to - b.to)) {
    if (m.to > from && m.to <= SCHEMA_VERSION) {
      await m.run();
      applied++;
    }
  }
  await saveMeta({ version: SCHEMA_VERSION });
  return { from, to: SCHEMA_VERSION, applied };
}

export async function storageFootprint() {
  try {
    const bytes = await chrome.storage.local.getBytesInUse(null);
    return bytes;
  } catch {
    return 0;
  }
}
