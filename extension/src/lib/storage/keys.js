// Storage keys and the schema version.
// Part of the persistence layer; import from ../storage.js (the facade).

// v2: per-domain hourly map `dh`.  v3: optional per-day session logs (ttt_sess_<day>).
// Both are additive — old records need no rewrite.
export const SCHEMA_VERSION = 4;

export const K = {
  SETTINGS: 'ttt_settings',
  INDEX: 'ttt_index',
  META: 'ttt_meta',
  PREV: 'ttt_prev_snapshot',      // one-step undo for a replace import (see savePreReplaceSnapshot)
  blocked: (tabId) => `ttt_blocked_${tabId}`,   // storage.session: { d, u } of the page a tab was redirected away from
  day: (key) => `ttt_day_${key}`,
  sess: (key) => `ttt_sess_${key}`,
  FOCUS_LOG: 'ttt_focuslog',
};
export const SESS_PREFIX = 'ttt_sess_';
export const DAY_PREFIX = 'ttt_day_';
