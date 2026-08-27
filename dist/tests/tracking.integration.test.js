// Drives the REAL background.js tracking engine against a mocked browser:
// tabs/windows/idle/alarms + a controllable clock. Verifies that active time is
// actually accumulated, that the segment cap protects against dormancy, and that
// idle pauses counting.

import { test, before } from 'node:test';
import assert from 'node:assert/strict';

let clock = Date.now();
const realNow = Date.now;
Date.now = () => clock;

let mockBytesInUse = 0; // controllable per-test for the storage-quota-warning tests

function area({ trackBytes = false } = {}) {
  const store = new Map();
  return {
    _store: store,
    async get(keys) {
      if (keys == null) { const o = {}; for (const [k, v] of store) o[k] = v; return o; }
      if (typeof keys === 'string') return store.has(keys) ? { [keys]: store.get(keys) } : {};
      if (Array.isArray(keys)) { const o = {}; for (const k of keys) if (store.has(k)) o[k] = store.get(k); return o; }
      const o = {}; for (const k of Object.keys(keys)) o[k] = store.has(k) ? store.get(k) : keys[k]; return o;
    },
    async set(obj) { for (const [k, v] of Object.entries(obj)) store.set(k, structuredClone(v)); },
    async remove(keys) { for (const k of (Array.isArray(keys) ? keys : [keys])) store.delete(k); },
    async getBytesInUse() { return trackBytes ? mockBytesInUse : 0; },
  };
}

const listeners = {};
function evt() { const fns = []; return { addListener: (f) => fns.push(f), _fire: (...a) => Promise.all(fns.map((f) => f(...a))), _fns: fns }; }

// Mutable active tab the engine will "see".
const activeTab = { id: 1, url: 'https://youtube.com/watch?v=1', audible: false };
let messageListener = null;

let createdNotifications = [];

globalThis.chrome = {
  storage: { local: area({ trackBytes: true }), session: area() },
  tabs: {
    query: async (q) => (q && q.active ? [activeTab] : [activeTab]),
    update: async () => {},
    onActivated: evt(), onUpdated: evt(), onRemoved: evt(),
  },
  windows: {
    WINDOW_ID_NONE: -1,
    getLastFocused: async () => ({ id: 1, focused: true }),
    onFocusChanged: (listeners.focus = evt()),
  },
  idle: {
    setDetectionInterval: () => {},
    queryState: async () => 'active',
    onStateChanged: (listeners.idle = evt()),
  },
  alarms: { create: () => {}, onAlarm: (listeners.alarm = evt()) },
  commands: { onCommand: evt() },
  action: { setBadgeBackgroundColor: () => {}, setBadgeText: () => {} },
  notifications: {
    create: (id, opts) => { createdNotifications.push({ id, opts }); },
    clear: () => {},
    onButtonClicked: evt(),
  },
  runtime: {
    getURL: (p) => `chrome-extension://test/${p}`,
    onMessage: { addListener: (f) => { messageListener = f; } },
    onStartup: { addListener: () => {} },
    onInstalled: { addListener: () => {} },
  },
};

const storage = await import('../../extension/src/lib/storage.js');
const { dayKey } = await import('../../extension/src/lib/utils.js');
function send(msg) { return new Promise((res) => { messageListener(msg, {}, res); }); }
const settle = () => new Promise((r) => setTimeout(r, 30));

function youtubeSeconds() {
  for (const [k, v] of chrome.storage.local._store) {
    if (k.startsWith('ttt_day_') && v.domains['youtube.com']) return v.domains['youtube.com'].t;
  }
  return 0;
}

before(async () => {
  await import('../../extension/background.js'); // runs init(), registers listeners, starts a segment
  await settle();
});

test('counts active time on the focused, non-idle tab', async () => {
  await send({ type: 'flush' });      // commit baseline (~0s)
  clock += 60_000;                    // 60s pass on youtube.com
  await send({ type: 'flush' });      // commit the minute
  const t = youtubeSeconds();
  assert.ok(t >= 58 && t <= 62, `expected ~60s, got ${t}`);
});

test('segment cap limits a single commit to 120s (dormancy guard)', async () => {
  const base = youtubeSeconds();
  clock += 10 * 60_000;               // pretend 10 minutes elapsed with no heartbeat
  await send({ type: 'flush' });
  const added = youtubeSeconds() - base;
  assert.ok(added <= 121, `cap breached: added ${added}s`);
  assert.ok(added >= 100, `expected ~120s credited, got ${added}`);
});

test('going idle pauses counting', async () => {
  await send({ type: 'flush' });
  const base = youtubeSeconds();
  await listeners.idle._fire('idle');  // user goes idle
  await settle();                      // let the idle-triggered refresh drain
  clock += 5 * 60_000;                 // 5 idle minutes
  await send({ type: 'flush' });
  assert.equal(youtubeSeconds(), base, 'time was counted while idle');
});

test('live counter reports the current domain', async () => {
  await listeners.idle._fire('active'); // come back
  await settle();
  const live = await send({ type: 'getLive' });
  assert.equal(live.enabled, true);
  assert.equal(live.currentDomain, 'youtube.com');
  assert.equal(live.counting, true);
});

test('a blacklisted domain is not counted', async () => {
  await send({ type: 'flush' });                 // commit whatever segment is open
  const base = youtubeSeconds();
  await storage.saveSettings({ blacklist: ['youtube.com'] });
  await send({ type: 'settingsChanged' });        // re-evaluate the current tab under new settings
  clock += 60_000;                                // a minute passes on the now-blacklisted tab
  await send({ type: 'flush' });
  assert.equal(youtubeSeconds(), base, 'counted time on a blacklisted domain');
  await storage.saveSettings({ blacklist: [] });  // restore for later tests
  await send({ type: 'settingsChanged' });
});

test('disabling tracking stops counting', async () => {
  await send({ type: 'setEnabled', value: false });
  const base = youtubeSeconds();
  clock += 60_000;
  await send({ type: 'flush' });
  assert.equal(youtubeSeconds(), base, 'counted while disabled');
});

test('daily limit fires an 80% warning then a 100%-reached notification, each once', async () => {
  await send({ type: 'setEnabled', value: true });
  await storage.saveSettings({ notifyLimits: true, dailyLimitMinutes: 10, blacklist: [] }); // 600s
  const today = dayKey();
  await chrome.storage.local.remove([`ttt_day_${today}`, 'ttt_index']); // clean slate for exact limit math
  await send({ type: 'settingsChanged' });

  await storage.addTime({ dateKey: today, domain: 'youtube.com', seconds: 500, hour: 12 }); // 83% of 600s
  createdNotifications = [];
  await send({ type: 'flush' });
  await settle();
  const warn = createdNotifications.find((n) => n.id === `daily:${today}:80`);
  assert.ok(warn, 'expected an 80% warning notification');
  assert.equal(warn.opts.buttons?.length, 1, 'limit notifications offer a snooze button');

  await storage.addTime({ dateKey: today, domain: 'youtube.com', seconds: 150, hour: 12 }); // now 650s, past 600s
  createdNotifications = [];
  await send({ type: 'flush' });
  await settle();
  const reached = createdNotifications.find((n) => n.id === `daily:${today}`);
  assert.ok(reached, 'expected the 100%-reached notification');

  // Both are deduped for the rest of the day: flushing again fires neither again.
  createdNotifications = [];
  await send({ type: 'flush' });
  await settle();
  assert.equal(createdNotifications.filter((n) => n.id.startsWith('daily:')).length, 0);

  await storage.saveSettings({ dailyLimitMinutes: 0 }); // restore for later tests
});

test('snoozing a limit notification suppresses it for the snooze window', async () => {
  await storage.saveSettings({ siteLimits: { 'youtube.com': 5 } }); // 300s
  const today = dayKey();
  await chrome.storage.local.remove([`ttt_day_${today}`, 'ttt_index']);
  await send({ type: 'settingsChanged' });

  await storage.addTime({ dateKey: today, domain: 'youtube.com', seconds: 260, hour: 12 }); // 87% of 300s
  createdNotifications = [];
  await send({ type: 'flush' });
  await settle();
  const warnId = `site:${today}:youtube.com:80`;
  assert.ok(createdNotifications.some((n) => n.id === warnId), 'expected the site 80% warning');

  await chrome.notifications.onButtonClicked._fire(warnId, 0); // click its snooze button
  await settle();

  // Push well past 100% - normally fires the reached notification, but the
  // snooze should suppress both it and any repeat of the warning.
  createdNotifications = [];
  await storage.addTime({ dateKey: today, domain: 'youtube.com', seconds: 100, hour: 12 }); // 360s > 300s
  await send({ type: 'flush' });
  await settle();
  assert.equal(createdNotifications.filter((n) => n.id.startsWith('site:')).length, 0, 'snoozed limit should not fire');

  await storage.saveSettings({ siteLimits: {} }); // restore for later tests
});

test('a storage-quota warning fires once when local storage crosses the threshold', async () => {
  // Storage warnings use notify()'s default '' id (not snoozable/deduped-by-id
  // like limit notifications), so detect them by their message content instead
  // (the notif.storageWarn.* keys), since other plain notify() calls (e.g. the
  // weekly summary, if it happens to also fire on this alarm tick) share that
  // same empty id.
  mockBytesInUse = 0;
  createdNotifications = [];
  await listeners.alarm._fire({ name: 'ttt_backup' });
  await settle();
  const hasWarnBelow = createdNotifications.some((n) => /TimeTrack is using|משתמש ב-/.test(n.opts?.message || ''));
  assert.equal(hasWarnBelow, false, 'no warning below the threshold');

  mockBytesInUse = 260 * 1024 * 1024; // over the 250MB threshold
  createdNotifications = [];
  await listeners.alarm._fire({ name: 'ttt_backup' });
  await settle();
  const warned = createdNotifications.some((n) => /TimeTrack is using|משתמש ב-/.test(n.opts?.message || ''));
  assert.ok(warned, 'expected a storage warning once over the threshold');

  // Deduped via meta.lastStorageWarning: firing the alarm again does not repeat it.
  createdNotifications = [];
  await listeners.alarm._fire({ name: 'ttt_backup' });
  await settle();
  const warnedAgain = createdNotifications.some((n) => /TimeTrack is using|משתמש ב-/.test(n.opts?.message || ''));
  assert.equal(warnedAgain, false, 'storage warning should be deduped, not repeated on every alarm tick');

  mockBytesInUse = 0;
  Date.now = realNow; // restore for any later files (each file is its own process anyway)
});
