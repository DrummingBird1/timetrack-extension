// Persistence layer. Data is stored one record per day under `ttt_day_<key>`
// so each tracking commit only rewrites a small object, with a separate
// `ttt_index` listing the days that exist.

import { dayKey } from './utils.js';

export const SCHEMA_VERSION = 2;

export const K = {
  SETTINGS: 'ttt_settings',
  INDEX: 'ttt_index',
  META: 'ttt_meta',
  day: (key) => `ttt_day_${key}`,
};

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
  notifyLimits: true,            // fire notifications when limits are hit
  weeklySummary: true,           // weekly digest notification
  categoryMap: {},               // domain -> category override
  blacklist: [],                 // domains never tracked
  realFavicons: false,           // use Chrome's local _favicon icons (opt-in perm)
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

export async function saveSettings(patch) {
  const current = await getSettings();
  const next = deepMerge(current, patch);
  await chrome.storage.local.set({ [K.SETTINGS]: next });
  return next;
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

export async function pruneOld(retentionDays) {
  if (!retentionDays || retentionDays <= 0) return 0;
  const idx = await getIndex();
  const cutoff = dayKey(new Date(Date.now() - retentionDays * 86400000));
  const remove = idx.filter((k) => k < cutoff);
  if (!remove.length) return 0;
  await chrome.storage.local.remove(remove.map(K.day));
  const kept = idx.filter((k) => k >= cutoff);
  await chrome.storage.local.set({ [K.INDEX]: kept });
  return remove.length;
}

export async function clearAllData() {
  const idx = await getIndex();
  await chrome.storage.local.remove(idx.map(K.day));
  await chrome.storage.local.set({ [K.INDEX]: [] });
  await saveMeta({ firstDay: null });
}

/** Full snapshot for export / backup. */
export async function exportAll() {
  const settings = await getSettings();
  const idx = await getIndex();
  const days = await getDays(idx);
  const meta = await getMeta();
  return {
    app: 'TimeTrack',
    version: SCHEMA_VERSION,
    exportedAt: Date.now(),
    meta,
    settings,
    days,
  };
}

/**
 * Restore a snapshot. mode "replace" wipes existing days first; "merge" keeps
 * the larger time/visits per domain so re-importing never double counts.
 */
export async function importAll(snapshot, { mode = 'merge', includeSettings = true } = {}) {
  if (!snapshot || typeof snapshot !== 'object' || !snapshot.days) {
    throw new Error('קובץ גיבוי לא תקין');
  }
  if (includeSettings && snapshot.settings) {
    await chrome.storage.local.set({ [K.SETTINGS]: deepMerge(DEFAULT_SETTINGS, snapshot.settings) });
  }
  if (mode === 'replace') await clearAllData();

  const writes = {};
  const idx = new Set(await getIndex());
  const existing = await getDays(Object.keys(snapshot.days));

  for (const [key, incoming] of Object.entries(snapshot.days)) {
    const base = existing[key] || emptyDay();
    const merged = mode === 'replace' ? incoming : mergeDay(base, incoming);
    writes[K.day(key)] = merged;
    idx.add(key);
  }
  writes[K.INDEX] = [...idx].sort();
  await chrome.storage.local.set(writes);
  return Object.keys(snapshot.days).length;
}

function mergeDh(a = {}, b = {}) {
  const out = { ...a };
  for (const [h, v] of Object.entries(b)) out[h] = Math.max(out[h] || 0, v || 0);
  return Object.keys(out).length ? out : undefined;
}

function mergeDay(a, b) {
  const out = { domains: { ...a.domains }, hours: (a.hours || new Array(24).fill(0)).slice() };
  for (const [domain, rec] of Object.entries(b.domains || {})) {
    const cur = out.domains[domain] || { t: 0, v: 0 };
    const merged = { t: Math.max(cur.t, rec.t || 0), v: Math.max(cur.v, rec.v || 0) };
    const dh = mergeDh(cur.dh, rec.dh);
    if (dh) merged.dh = dh;
    out.domains[domain] = merged;
  }
  const bh = b.hours || [];
  for (let i = 0; i < 24; i++) out.hours[i] = Math.max(out.hours[i] || 0, bh[i] || 0);
  return out;
}

// ---- schema migrations ----
// Registered as { to: <version>, run: async () => {...} }. On startup `migrate()`
// applies every migration whose target exceeds the stored meta.version, in order,
// then stamps meta.version = SCHEMA_VERSION. New transforms are appended here.
const MIGRATIONS = [
  // v2 added the per-domain hourly map `dh`. It's additive and lazily populated,
  // so old day records need no rewrite — stats treat a missing `dh` as "no data".
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
