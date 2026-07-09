// Drives the REAL background.js tracking engine against a mocked browser:
// tabs/windows/idle/alarms + a controllable clock. Verifies that active time is
// actually accumulated, that the segment cap protects against dormancy, and that
// idle pauses counting.

import { test, before } from 'node:test';
import assert from 'node:assert/strict';

let clock = Date.now();
const realNow = Date.now;
Date.now = () => clock;

function area() {
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
    async getBytesInUse() { return 0; },
  };
}

const listeners = {};
function evt() { const fns = []; return { addListener: (f) => fns.push(f), _fire: (...a) => Promise.all(fns.map((f) => f(...a))), _fns: fns }; }

// Mutable active tab the engine will "see".
const activeTab = { id: 1, url: 'https://youtube.com/watch?v=1', audible: false };
let messageListener = null;

globalThis.chrome = {
  storage: { local: area(), session: area() },
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
  alarms: { create: () => {}, onAlarm: evt() },
  commands: { onCommand: evt() },
  action: { setBadgeBackgroundColor: () => {}, setBadgeText: () => {} },
  notifications: { create: () => {} },
  runtime: {
    getURL: (p) => `chrome-extension://test/${p}`,
    onMessage: { addListener: (f) => { messageListener = f; } },
    onStartup: { addListener: () => {} },
    onInstalled: { addListener: () => {} },
  },
};

function send(msg) { return new Promise((res) => { messageListener(msg, {}, res); }); }
const settle = () => new Promise((r) => setTimeout(r, 30));

function youtubeSeconds() {
  for (const [k, v] of chrome.storage.local._store) {
    if (k.startsWith('ttt_day_') && v.domains['youtube.com']) return v.domains['youtube.com'].t;
  }
  return 0;
}

before(async () => {
  await import('../../../extension/background.js'); // runs init(), registers listeners, starts a segment
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

test('disabling tracking stops counting', async () => {
  await send({ type: 'setEnabled', value: false });
  const base = youtubeSeconds();
  clock += 60_000;
  await send({ type: 'flush' });
  assert.equal(youtubeSeconds(), base, 'counted while disabled');
  Date.now = realNow; // restore for any later files (each file is its own process anyway)
});
