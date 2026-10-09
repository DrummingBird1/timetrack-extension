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
  notifications: { create: () => {}, clear: () => {}, onButtonClicked: evt() },
  runtime: {
    getURL: (p) => `chrome-extension://test/${p}`,
    onMessage: { addListener: (f) => { messageListener = f; } },
    onStartup: { addListener: () => {} },
    onInstalled: { addListener: () => {} },
  },
};

await import('./helpers/node-locales.js');   // i18n loads dictionaries via fetch(); give Node a disk loader
const storage = await import('../../extension/src/lib/storage.js');
const send = (msg) => new Promise((res) => messageListener(msg, {}, res));
const settle = () => new Promise((r) => setTimeout(r, 20));

before(async () => { await import('../../extension/background.js'); await settle(); });
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

test('a long break replaces the normal break every N cycles', async () => {
  await storage.saveSettings({ focus: {
    mode: 'block', defaultMinutes: 1, breakMinutes: 1, longBreakMinutes: 5, longBreakEvery: 2, cycles: 3,
  } });
  let f = await send({ type: 'startFocus' });
  assert.equal(f.phase, 'work');
  assert.equal(f.cycle, 1);

  clock += 61_000;                 // finish work #1 → cycle 1 not divisible by 2 → normal break
  f = await send({ type: 'getFocus' });
  assert.equal(f.phase, 'break');
  assert.ok(f.remaining <= 61, `expected a short break, got ${f.remaining}s`);

  clock += 61_000;                 // finish normal break → work #2
  f = await send({ type: 'getFocus' });
  assert.equal(f.phase, 'work');
  assert.equal(f.cycle, 2);

  clock += 61_000;                 // finish work #2 → cycle 2 divisible by 2 → LONG break
  f = await send({ type: 'getFocus' });
  assert.equal(f.phase, 'break');
  assert.ok(f.remaining > 61, `expected a long (5-min) break, got ${f.remaining}s`);
  await send({ type: 'stopFocus' });
});

test('a stopped session is no longer active', async () => {
  await storage.saveSettings({ focus: { mode: 'block', defaultMinutes: 10, cycles: 1 } });
  await send({ type: 'startFocus' });
  await send({ type: 'stopFocus' });
  const f = await send({ type: 'getFocus' });
  assert.equal(f.active, false);
});

// ---------------- strict mode, snooze, history, schedule (v2) ----------------
test('strict mode: a work phase cannot be ended or snoozed; a break can be ended', async () => {
  await storage.saveSettings({ focus: { mode: 'block', defaultMinutes: 10, breakMinutes: 1, cycles: 2, strict: true } });
  let f = await send({ type: 'startFocus' });
  assert.equal(f.strict, true);

  const stop = await send({ type: 'stopFocus' });
  assert.equal(stop.refused, true);
  assert.equal(stop.active, true);
  const snooze = await send({ type: 'snoozeFocus', minutes: 10 });
  assert.equal(snooze.refused, true, 'strict mode forbids pausing the block');
  assert.equal((await send({ type: 'getFocus' })).active, true, 'the session is still running');

  clock += 10 * 60_000 + 1000;                       // work #1 ends → break
  f = await send({ type: 'getFocus' });
  assert.equal(f.phase, 'break');
  assert.equal((await send({ type: 'stopFocus' })).active, false, 'a break may be ended');
  await storage.saveSettings({ focus: { strict: false } });
});

test('snooze: pauses blocking for a while, then blocking resumes', async () => {
  await storage.saveSettings({ focus: { mode: 'block', blockDomains: ['facebook.com'], blockCategories: [], defaultMinutes: 60, cycles: 1, strict: false } });
  tabsList = [{ id: 1, url: 'https://facebook.com/feed' }];
  await send({ type: 'startFocus' });
  await settle();
  assert.ok(updates.some((u) => u.id === 1 && u.url.includes('blocked.html')), 'blocked at first');

  const snoozed = await send({ type: 'snoozeFocus', minutes: 10 });
  assert.ok(snoozed.pausedUntil > clock, 'the view reports the pause');
  updates = [];
  tabsList = [{ id: 2, url: 'https://facebook.com/other' }];
  await chrome.tabs.onUpdated._fire?.(2, { url: 'https://facebook.com/other' }, { id: 2, active: false });
  await settle();
  assert.ok(!updates.some((u) => u.id === 2), 'not redirected while snoozed');

  clock += 10 * 60_000 + 1000;                       // pause over
  await send({ type: 'getFocus' });                  // expiry is handled when the engine next looks
  await settle();
  assert.ok(updates.some((u) => u.id === 2 && u.url.includes('blocked.html')), 'blocking resumed and re-enforced open tabs');
  await send({ type: 'stopFocus' });
  await storage.saveSettings({ focus: { blockDomains: [] } });
});

test('history: finished and early-ended sessions are logged; trivial ones are not', async () => {
  await storage.clearFocusLog();
  await storage.saveSettings({ focus: { mode: 'block', blockDomains: [], defaultMinutes: 10, breakMinutes: 1, cycles: 2, strict: false } });

  await send({ type: 'startFocus' });
  clock += 10 * 60_000 + 1000;                       // work #1 done → break
  await send({ type: 'getFocus' });
  clock += 61_000;                                   // break done → work #2
  await send({ type: 'getFocus' });
  clock += 4 * 60_000;                               // 4 minutes into work #2, then the user stops
  await send({ type: 'stopFocus' });

  await send({ type: 'startFocus' });
  await send({ type: 'stopFocus' });                 // stopped immediately: noise, not logged

  await send({ type: 'startFocus', minutes: 5 });
  clock += 5 * 60_000 + 1000;
  await send({ type: 'getFocus' });                  // (cycles: 2 → break), finish everything
  clock += 61_000; await send({ type: 'getFocus' });
  clock += 5 * 60_000 + 1000; await send({ type: 'getFocus' });

  const log = await storage.getFocusLog();
  assert.equal(log.length, 2, 'two real sessions');
  assert.equal(log[0].endedEarly, true);
  assert.equal(log[0].completedCycles, 1);
  assert.ok(Math.abs(log[0].workedMs - (10 + 4) * 60_000) < 5000, `worked ${log[0].workedMs}`);
  assert.equal(log[1].endedEarly, false);
  assert.equal(log[1].completedCycles, 2);
  assert.ok(log[1].end > log[1].start);
});

test('schedule: a session starts at its slot, once per day, only on chosen weekdays', async () => {
  const now = new Date();
  const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const otherDay = (now.getDay() + 3) % 7;
  await storage.saveSettings({ focus: { defaultMinutes: 10, cycles: 1, schedule: [
    { days: [otherDay], time: hhmm, minutes: 7 },          // wrong weekday → ignored
    { days: [now.getDay()], time: hhmm, minutes: 15 },
  ] } });
  assert.equal((await send({ type: 'getFocus' })).active, false);

  await send({ type: 'flush' });                           // the engine's tick checks the schedule
  await settle();
  const started = await send({ type: 'getFocus' });
  assert.equal(started.active, true, 'scheduled session started');
  assert.ok(Math.abs(started.remaining - 15 * 60) < 5, `expected 15 min, got ${started.remaining}s`);

  await send({ type: 'stopFocus' });
  await send({ type: 'flush' });
  await settle();
  assert.equal((await send({ type: 'getFocus' })).active, false, 'does not restart the same slot again today');
  await storage.saveSettings({ focus: { schedule: [] } });
});
