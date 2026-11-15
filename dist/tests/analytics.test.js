// Pure analytics added in 1.5.0: category budgets, weekly focus score, best week and the
// goal-met streak. Fixtures use known domains so categories are predictable:
//   github.com -> productivity (+1)   youtube.com -> entertainment (-1)   bbc.co.uk -> news (0)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  budgetStatus, weeklyFocusScores, bestWeek, goalStreak, categorySeconds,
} from '../../extension/src/lib/stats.js';

const day = (domains) => ({ domains: Object.fromEntries(Object.entries(domains).map(([d, t]) => [d, { t, v: 1 }])), hours: new Array(24).fill(0) });

test('categorySeconds sums seconds per category and honours user overrides', () => {
  const days = { a: day({ 'github.com': 600, 'youtube.com': 300 }), b: day({ 'github.com': 100, 'bbc.co.uk': 50 }) };
  assert.deepEqual(categorySeconds(days, {}), { productivity: 700, entertainment: 300, news: 50 });
  assert.deepEqual(categorySeconds(days, { 'youtube.com': 'productivity' }), { productivity: 1000, news: 50 });
});

test('budgetStatus compares each budgeted category with its usage', () => {
  const days = { a: day({ 'youtube.com': 1800 }), b: day({ 'youtube.com': 1800, 'github.com': 600 }) };
  const status = budgetStatus(days, {}, { entertainment: 90, productivity: 600, news: 30 });
  const by = Object.fromEntries(status.map((s) => [s.key, s]));
  assert.equal(by.entertainment.usedSeconds, 3600);
  assert.equal(by.entertainment.limitSeconds, 5400);
  assert.equal(Math.round(by.entertainment.pct), 67);
  assert.equal(by.productivity.pct, 100 * 600 / 36000);
  assert.equal(by.news.usedSeconds, 0, 'a budget with no usage still appears');
  assert.deepEqual(status.map((s) => s.key), ['entertainment', 'productivity', 'news'], 'most-used first');
});

test('budgetStatus ignores non-positive budgets and unknown shapes', () => {
  assert.deepEqual(budgetStatus({}, {}, { news: 0, social: -5 }), []);
  assert.deepEqual(budgetStatus({}, {}, undefined), []);
});

// 2026-03-01 is a Sunday; weeks start on Sunday (weekStart 0).
test('weeklyFocusScores groups days by week and scores each', () => {
  const days = {
    '2026-03-02': day({ 'github.com': 3600 }),                       // week of 03-01: all productive → 100
    '2026-03-03': day({ 'github.com': 1800 }),
    '2026-03-09': day({ 'youtube.com': 3600 }),                      // week of 03-08: all distracting → 0
    '2026-03-17': day({ 'github.com': 1800, 'youtube.com': 1800 }),  // week of 03-15: balanced → 50
  };
  const out = weeklyFocusScores(days, { weekStart: 0, weeks: 4, today: new Date(2026, 2, 18), categoryMap: {} });
  assert.deepEqual(out.map((w) => w.weekKey), ['2026-02-22', '2026-03-01', '2026-03-08', '2026-03-15']);
  const byWeek = Object.fromEntries(out.map((w) => [w.weekKey, w]));
  assert.equal(byWeek['2026-03-01'].score, 100);
  assert.equal(byWeek['2026-03-08'].score, 0);
  assert.equal(byWeek['2026-03-15'].score, 50);
  assert.equal(byWeek['2026-03-15'].totalSeconds, 3600);
  assert.equal(out.length, 4, 'one entry per requested week, oldest first');
  assert.equal(out[out.length - 1].weekKey, '2026-03-15', 'the last entry is the current week');
  assert.equal(out[0].score, null, 'a week with no data has no score');
});

test('bestWeek picks the highest score among weeks with enough data', () => {
  const weeks = [
    { weekKey: 'a', score: 40, totalSeconds: 36000 },
    { weekKey: 'b', score: 95, totalSeconds: 600 },       // too little data to count
    { weekKey: 'c', score: 72, totalSeconds: 7200 },
    { weekKey: 'd', score: null, totalSeconds: 0 },
  ];
  assert.equal(bestWeek(weeks).weekKey, 'c');
  assert.equal(bestWeek(weeks, 0).weekKey, 'b', 'threshold is configurable');
  assert.equal(bestWeek([{ weekKey: 'x', score: null, totalSeconds: 0 }]), null);
  assert.equal(bestWeek([]), null);
});

test('goalStreak counts consecutive days with enough productive time, ending today', () => {
  const days = {
    '2026-03-14': day({ 'github.com': 3600 }),
    '2026-03-15': day({ 'github.com': 3600 }),
    '2026-03-16': day({ 'github.com': 3600, 'youtube.com': 9000 }),   // distracting time does not count against it
    '2026-03-17': day({ 'github.com': 3600 }),
  };
  assert.equal(goalStreak(days, 3000, {}, '2026-03-17'), 4);
  assert.equal(goalStreak(days, 4000, {}, '2026-03-17'), 0, 'goal not met on any day');
});

test('goalStreak is not broken by a day that has not been met YET (today)', () => {
  const days = {
    '2026-03-15': day({ 'github.com': 3600 }),
    '2026-03-16': day({ 'github.com': 3600 }),
    '2026-03-17': day({ 'github.com': 600 }),                          // today, still in progress
  };
  assert.equal(goalStreak(days, 3000, {}, '2026-03-17'), 2, 'counts yesterday and before');
  days['2026-03-17'] = day({ 'github.com': 3600 });
  assert.equal(goalStreak(days, 3000, {}, '2026-03-17'), 3, 'today counts once it is met');
});

test('goalStreak stops at a gap and handles a disabled goal', () => {
  const days = { '2026-03-17': day({ 'github.com': 3600 }), '2026-03-15': day({ 'github.com': 3600 }) };
  assert.equal(goalStreak(days, 3000, {}, '2026-03-17'), 1, '03-16 is missing');
  assert.equal(goalStreak(days, 0, {}, '2026-03-17'), 0, 'goal 0 = off');
});

test('siteChanges ranks sites by the size of their change between two periods', async () => {
  const { siteChanges } = await import('../../extension/src/lib/stats.js');
  const a = { 'x.com': { t: 900 }, 'y.com': { t: 100 }, 'same.com': { t: 50 }, 'new.com': { t: 300 } };
  const b = { 'x.com': { t: 100 }, 'y.com': { t: 700 }, 'same.com': { t: 50 }, 'gone.com': { t: 200 } };
  const out = siteChanges(a, b, 10);
  assert.deepEqual(out.map((c) => [c.domain, c.delta]), [['x.com', 800], ['y.com', -600], ['new.com', 300], ['gone.com', -200]]);
  assert.equal(siteChanges(a, b, 2).length, 2);
  assert.deepEqual(siteChanges({}, {}), []);
  assert.deepEqual(siteChanges(undefined, undefined), []);
});

// ---- 2.0 smarter insights ----
import { smartInsights as smart } from '../../extension/src/lib/stats.js';

const dayRec = (domains, hours = new Array(24).fill(0)) => ({
  domains: Object.fromEntries(Object.entries(domains).map(([d, v]) => [d, typeof v === 'number' ? { t: v, v: 1 } : v])),
  hours,
});
const keysOf = (items) => items.map((i) => i.key);

test('smartInsights stays quiet when there is nothing notable or no data', () => {
  assert.deepEqual(smart({}, {}), []);
  const flat = { '2026-03-02': dayRec({ 'a.com': 3600 }, Object.assign(new Array(24).fill(0), { 10: 3600 })) };
  assert.deepEqual(smart(flat, flat), []);
});

test('smartInsights flags late-night browsing only when it is a real share', () => {
  const night = (secs) => ({ '2026-03-02': dayRec({ 'a.com': 3600 }, Object.assign(new Array(24).fill(0), { 2: secs, 10: 3600 - secs })) });
  assert.deepEqual(smart(night(1900), {}).find((i) => i.key === 'insight.lateNight').vars, { pct: 53 });
  assert.ok(!keysOf(smart(night(600), {})).includes('insight.lateNight'), 'ten minutes is not a pattern');
});

test('smartInsights names a site that is new near the top, but not when there is no earlier period to compare', () => {
  const cur = { '2026-03-09': dayRec({ 'old.com': 3000, 'new.com': 2400 }) };
  const prev = { '2026-03-02': dayRec({ 'old.com': 3000 }) };
  assert.deepEqual(smart(cur, prev).find((i) => i.key === 'insight.newSite').vars, { site: 'new.com' });
  assert.ok(!keysOf(smart(cur, {})).includes('insight.newSite'));
  assert.ok(!keysOf(smart({ '2026-03-09': dayRec({ 'old.com': 3000, 'new.com': 600 }) }, prev)).includes('insight.newSite'), 'ten minutes is not "near the top"');
});

test('smartInsights reports the tag that moved most, needing 30 min before and a 40% swing', () => {
  const tags = { Work: ['w.com'], Fun: ['f.com'], Tiny: ['t.com'] };
  const prev = { '2026-03-02': dayRec({ 'w.com': 3600, 'f.com': 3600, 't.com': 600 }) };
  const cur = { '2026-03-09': dayRec({ 'w.com': 7200, 'f.com': 1800, 't.com': 6000 }) };
  const swing = smart(cur, prev, { tags }).find((i) => i.key.startsWith('insight.tag'));
  assert.deepEqual(swing, { key: 'insight.tagUp', vars: { tag: 'Work', pct: 100 } }, 'Tiny had under 30 minutes before, so it cannot win');
  const down = smart({ '2026-03-09': dayRec({ 'w.com': 3600, 'f.com': 600 }) }, prev, { tags }).find((i) => i.key.startsWith('insight.tag'));
  assert.deepEqual(down, { key: 'insight.tagDown', vars: { tag: 'Fun', pct: 83 } });
});

test('smartInsights finds the most productive hour from productive-category sites only', () => {
  const cur = { '2026-03-09': dayRec({
    'github.com': { t: 5400, v: 1, dh: { 9: 1800, 14: 3600 } },
    'youtube.com': { t: 7200, v: 1, dh: { 21: 7200 } },
  }) };
  assert.deepEqual(smart(cur, {}).find((i) => i.key === 'insight.bestHour').vars, { h: '14:00' });
  assert.ok(!keysOf(smart({ '2026-03-09': dayRec({ 'github.com': { t: 600, v: 1, dh: { 9: 600 } } }) }, {})).includes('insight.bestHour'), 'under an hour of productive time');
});
