// Drives the REAL background.js focus engine against a mocked browser to verify
// the Pomodoro state machine (work→break→work→done) and both blocking modes
// (block-list and allow-list), including that tabs get redirected to the block page.

import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

let clock = Date.now();
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
function evt() { const fns = []; return { addListener: (f) => fns.push(f), _fire: (...a) => Promise.all(fns.map((f) => f(...a))) }; }

let tabsList = [];
let updates = [];
let messageListener = null;

globalThis.chrome = {
  storage: { local: area(), session: area() },
  tabs: {
    query: async (q) => (q && q.active ? [tabsList[0]].filter(Boolean) : tabsList.slice()),
    update: async (id, props) => {
      updates.push({ id, url: props.url });
      const tab = tabsList.find((t) => t.id === id);
      if (tab) tab.url = props.url; // reflect redirect so it isn't re-fired
    },
    onActivated: evt(), onUpdated: evt(), onRemoved: evt(),
  },
  windows: { WINDOW_ID_NONE: -1, getLastFocused: async () => ({ id: 1, focused: true }), onFocusChanged: evt() },
  idle: { setDetectionInterval: () => {}, queryState: async () => 'active', onStateChanged: evt() },
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

const storage = await import('../../../extension/src/lib/storage.js');
const send = (msg) => new Promise((res) => messageListener(msg, {}, res));
const settle = () => new Promise((r) => setTimeout(r, 20));

before(async () => { await import('../../../extension/background.js'); await settle(); });
beforeEach(() => { updates = []; tabsList = []; });

test('block mode redirects a blocked site to the block page', async () => {
  await storage.saveSettings({ focus: { mode: 'block', blockCategories: ['social'], defaultMinutes: 10 } });
  tabsList = [{ id: 1, url: 'https://facebook.com/feed' }, { id: 2, url: 'https://github.com/x' }];
  await send({ type: 'startFocus', minutes: 10 });
  await settle();
  assert.ok(updates.some((u) => u.id === 1 && u.url.includes('blocked.html')), 'facebook not blocked');
  assert.ok(!updates.some((u) => u.id === 2), 'github should not be blocked in block mode');
  await send({ type: 'stopFocus' });
});

test('allow mode blocks everything except allowed categories', async () => {
  await storage.saveSettings({ focus: { mode: 'allow', allowCategories: ['productivity'], defaultMinutes: 10 } });
  tabsList = [{ id: 1, url: 'https://facebook.com/feed' }, { id: 2, url: 'https://github.com/x' }];
  await send({ type: 'startFocus', minutes: 10 });
  await settle();
  assert.ok(updates.some((u) => u.id === 1 && u.url.includes('blocked.html')), 'facebook should be blocked');
  assert.ok(!updates.some((u) => u.id === 2), 'github (productivity) should be allowed');
  await send({ type: 'stopFocus' });
});

test('Pomodoro runs work → break → work → done', async () => {
  await storage.saveSettings({ focus: { mode: 'block', defaultMinutes: 1, breakMinutes: 1, cycles: 2 } });
  let f = await send({ type: 'startFocus' });
  assert.equal(f.phase, 'work');
  assert.equal(f.cycle, 1);
  assert.equal(f.totalCycles, 2);

  clock += 61_000;                 // finish work #1
  f = await send({ type: 'getFocus' });
  assert.equal(f.phase, 'break');
  assert.equal(f.active, true);

  clock += 61_000;                 // finish break
  f = await send({ type: 'getFocus' });
  assert.equal(f.phase, 'work');
  assert.equal(f.cycle, 2);

  clock += 61_000;                 // finish work #2 → done
  f = await send({ type: 'getFocus' });
  assert.equal(f.active, false);
});

test('a stopped session is no longer active', async () => {
  await storage.saveSettings({ focus: { mode: 'block', defaultMinutes: 10, cycles: 1 } });
  await send({ type: 'startFocus' });
  await send({ type: 'stopFocus' });
  const f = await send({ type: 'getFocus' });
  assert.equal(f.active, false);
});
