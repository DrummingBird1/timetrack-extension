// Persistence layer facade. Data is stored one record per day under `ttt_day_<key>` so each tracking commit
// only rewrites a small object, with a separate `ttt_index` listing the days that exist.
// The code lives in storage/: keys -> settings -> days -> logs -> maintenance -> transfer, and migrations.
// Everything is re-exported here so the rest of the extension keeps importing ./storage.js.

export * from './storage/keys.js';
export * from './storage/settings.js';
export * from './storage/days.js';
export * from './storage/logs.js';
export * from './storage/maintenance.js';
export * from './storage/transfer.js';
export * from './storage/migrations.js';
