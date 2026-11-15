// Settings: defaults, merge, the write lock and the map-setting helpers.
// Part of the persistence layer; import from ../storage.js (the facade).

import { K } from './keys.js';

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
  tags: {},                      // tag name -> domains (a tag matches a domain and its subdomains)
  tagBudgets: {},                // tag name -> minutes/week (notifies at 80% and 100%)
  notifyLimits: true,            // fire notifications when limits are hit
  weeklySummary: true,           // weekly digest notification
  reportFrequency: 'off',        // off | weekly | monthly: an HTML report written into the backup folder
  backupWarnDays: 7,             // warn when a configured backup hasn't succeeded for this many days (0 = off)
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
    strict: false,                               // work phases cannot be ended early or have the block paused
    schedule: [],                                // [{ days: [0-6], time: 'HH:MM', minutes }] auto-start slots
  },
  backup: {
    syncEnabled: false,          // mirror into chrome.storage.sync
    endpointUrl: '',             // optional custom REST backup endpoint
    endpointToken: '',           // bearer token for the endpoint
    encrypt: false,              // encrypt the backup payload with a passphrase
    passphrase: '',              // local-only; never transmitted in clear
    davUrl: '',                  // https folder of a WebDAV-style server; every backup is a new file there
    davUser: '',
    davPassword: '',             // local-only, like passphrase and endpointToken
    davKeep: 10,                 // versions kept on that server
    localEnabled: false,         // also write a file into the folder chosen in Settings (see localbackup.js)
    localKeep: 7,                // how many backup files to keep in that folder
    autoIntervalHours: 24,
    lastBackup: 0,
    lastBackupStatus: '',
  },
};

export function deepMerge(base, patch) {
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
export function withSettingsLock(fn) {
  // The in-context chain orders writes inside one page/worker; the Web Lock (when the
  // runtime has one) orders them across the worker, popup and dashboard, which share storage.
  const locked = () => (typeof navigator !== 'undefined' && navigator.locks
    ? navigator.locks.request('ttt_settings_write', fn)
    : fn());
  const run = settingsChain.then(locked);
  settingsChain = run.catch(() => {});
  return run;
}

export async function writeSettingsUnlocked(next) {
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
export const MAP_SETTINGS = ['categoryMap', 'siteLimits', 'categoryBudgets', 'tags', 'tagBudgets'];

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

/** Add or replace many entries of a map setting in a single write. */
export function setSettingsMapEntries(key, entries) {
  return editMapSetting(key, (map) => { Object.assign(map, entries); });
}

/** Delete many entries of a map setting in a single write. */
export function removeSettingsMapEntries(key, entryKeys) {
  return editMapSetting(key, (map) => { for (const k of entryKeys) delete map[k]; });
}

/** Delete one entry of a map setting. Deleting a missing entry is a no-op. */
export function removeSettingsMapEntry(key, entryKey) {
  return editMapSetting(key, (map) => { delete map[entryKey]; });
}
