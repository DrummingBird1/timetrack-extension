// Demo data for first-run exploration: deterministic, clearly separable from real data,
// and removable without touching anything the user tracked themselves.

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { installChrome } from './helpers/chrome-storage-mock.js';

installChrome();
const storage = await import('../../extension/src/lib/storage.js');
const demo = await import('../../extension/src/lib/demo.js');
const { dayKey, addDays } = await import('../../extension/src/lib/utils.js');

beforeEach(() => { installChrome(); });
const TODAY = new Date(2026, 5, 15);

test('buildDemoDays: 28 previous days, never today, deterministic, realistic', () => {
  const a = demo.buildDemoDays(TODAY);
  const keys = Object.keys(a).sort();
  assert.equal(keys.length, 28);
  assert.equal(keys[keys.length - 1], dayKey(addDays(TODAY, -1)));
  assert.ok(!(dayKey(TODAY) in a), 'today is left for real tracking');
  assert.deepEqual(demo.buildDemoDays(TODAY), a, 'same input → same output');
  for (const day of Object.values(a)) {
    const total = Object.values(day.domains).reduce((s, r) => s + r.t, 0);
    assert.ok(total > 30 * 60 && total < 12 * 3600, `a day of ${total}s looks unrealistic`);
    assert.equal(day.hours.reduce((s, h) => s + h, 0), total, 'hours add up to the day total');
  }
});

test('loadDemo imports the days and remembers which ones are demo', async () => {
  const r = await demo.loadDemo(TODAY);
  assert.equal(r.days, 28);
  assert.equal((await storage.getIndex()).length, 28);
  assert.equal(await demo.isDemoActive(), true);
});

test('loadDemo refuses when the profile already has data in that period', async () => {
  await storage.addTime({ dateKey: dayKey(addDays(TODAY, -3)), domain: 'real.com', seconds: 600, hour: 9 });
  await assert.rejects(() => demo.loadDemo(TODAY), (e) => e.code === 'HAS_DATA');
  assert.equal(await demo.isDemoActive(), false);
  assert.equal((await storage.getIndex()).length, 1);
});

test('removeDemo deletes only demo days — real tracking since then survives', async () => {
  await demo.loadDemo(TODAY);
  await storage.addTime({ dateKey: dayKey(TODAY), domain: 'real.com', seconds: 300, hour: 10 });   // the user's own day
  await storage.recordSession({ dateKey: dayKey(addDays(TODAY, -2)), domain: 'x.com', startSec: 10, seconds: 10 });
  const removed = await demo.removeDemo();
  assert.equal(removed, 28);
  assert.deepEqual(await storage.getIndex(), [dayKey(TODAY)]);
  assert.equal((await storage.getDay(dayKey(TODAY))).domains['real.com'].t, 300);
  assert.deepEqual(await storage.getSessions([dayKey(addDays(TODAY, -2))]), {}, 'their session logs go too');
  assert.equal(await demo.isDemoActive(), false);
  assert.equal((await storage.getMeta()).firstDay, dayKey(TODAY));
  assert.equal(await demo.removeDemo(), 0, 'removing twice is a no-op');
});
