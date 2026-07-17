import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  aggregateDomains, totalTime, topSites, byCategory, focusScore, dailyTotals,
  weekHourHeatmap, hourlyDistribution, activeDaysCount, currentStreak, trend, busiestHour,
  domainPeakHour, domainHourly, generateInsights,
} from '../../../extension/src/lib/stats.js';

// Two sample days. Hours arrays are sparse but valid (24 slots).
function hours(map) {
  const a = new Array(24).fill(0);
  for (const [h, v] of Object.entries(map)) a[h] = v;
  return a;
}

const days = {
  // 2026-06-21 is a Sunday
  '2026-06-21': {
    domains: {
      'github.com': { t: 3600, v: 4 },
      'youtube.com': { t: 1800, v: 2 },
    },
    hours: hours({ 9: 3600, 21: 1800 }),
  },
  '2026-06-22': {
    domains: {
      'github.com': { t: 1200, v: 1 },
      'facebook.com': { t: 600, v: 3 },
    },
    hours: hours({ 10: 1200, 22: 600 }),
  },
};

test('aggregateDomains sums time and visits across days', () => {
  const agg = aggregateDomains(days);
  assert.equal(agg['github.com'].t, 4800);
  assert.equal(agg['github.com'].v, 5);
  assert.equal(agg['youtube.com'].t, 1800);
  assert.equal(Object.keys(agg).length, 3);
});

test('totalTime sums everything', () => {
  assert.equal(totalTime(days), 3600 + 1800 + 1200 + 600);
});

test('topSites is sorted desc and respects the limit', () => {
  const agg = aggregateDomains(days);
  const top = topSites(agg, 2);
  assert.equal(top.length, 2);
  assert.equal(top[0].domain, 'github.com'); // 4800
  assert.equal(top[1].domain, 'youtube.com'); // 1800
});

test('byCategory groups with correct shares', () => {
  const agg = aggregateDomains(days);
  const cats = byCategory(agg);
  const total = totalTime(days);
  const prod = cats.find((c) => c.key === 'productivity'); // github
  assert.ok(prod);
  assert.equal(prod.t, 4800);
  assert.ok(Math.abs(prod.share - 4800 / total) < 1e-9);
  // shares sum to ~1
  assert.ok(Math.abs(cats.reduce((a, c) => a + c.share, 0) - 1) < 1e-9);
});

test('focusScore maps productive-heavy usage above neutral (50)', () => {
  const cats = byCategory(aggregateDomains(days));
  const score = focusScore(cats);
  assert.ok(score > 50, `expected >50, got ${score}`);
  assert.ok(score >= 0 && score <= 100);
  assert.equal(focusScore([]), null);
});

test('dailyTotals fills missing days with zero, preserves order', () => {
  const keys = ['2026-06-20', '2026-06-21', '2026-06-22'];
  const totals = dailyTotals(days, keys);
  assert.deepEqual(totals.map((d) => d.t), [0, 5400, 1800]);
  assert.deepEqual(totals.map((d) => d.key), keys);
});

test('weekHourHeatmap places seconds at the right weekday/hour', () => {
  const m = weekHourHeatmap(days);
  assert.equal(m.length, 7);
  assert.equal(m[0].length, 24);
  // 2026-06-21 is Sunday (0): 3600 at 09:00, 1800 at 21:00
  assert.equal(m[0][9], 3600);
  assert.equal(m[0][21], 1800);
  // 2026-06-22 is Monday (1): 1200 at 10:00, 600 at 22:00
  assert.equal(m[1][10], 1200);
  assert.equal(m[1][22], 600);
});

test('hourlyDistribution and busiestHour', () => {
  const dist = hourlyDistribution(days);
  assert.equal(dist[9], 3600);
  assert.equal(dist[10], 1200);
  assert.equal(busiestHour(dist), 9); // largest bucket
  assert.equal(busiestHour(new Array(24).fill(0)), null);
});

test('activeDaysCount counts days with any time', () => {
  assert.equal(activeDaysCount(days), 2);
  assert.equal(activeDaysCount({ x: { domains: {}, hours: new Array(24).fill(0) } }), 0);
});

test('currentStreak counts consecutive days back from today', () => {
  const index = ['2026-06-20', '2026-06-21', '2026-06-22'];
  assert.equal(currentStreak(index, '2026-06-22'), 3);
  assert.equal(currentStreak(['2026-06-20', '2026-06-22'], '2026-06-22'), 1); // gap on 21st
  assert.equal(currentStreak([], '2026-06-22'), 0);
});

test('trend is signed percentage change, null when no baseline', () => {
  assert.equal(trend(150, 100), 50);
  assert.equal(trend(50, 100), -50);
  assert.equal(trend(100, 0), null);
});

test('domainPeakHour finds a site\'s busiest hour from its dh map (v2)', () => {
  const d = {
    '2026-06-21': { domains: { 'a.com': { t: 100, v: 1, dh: { 9: 30, 14: 70 } } }, hours: new Array(24).fill(0) },
    '2026-06-22': { domains: { 'a.com': { t: 50, v: 1, dh: { 14: 50 } } }, hours: new Array(24).fill(0) },
  };
  assert.equal(domainPeakHour(d, 'a.com'), 14); // 70 + 50 = 120 at 14:00
  assert.equal(domainPeakHour(d, 'missing.com'), null);
  // legacy record without dh (pre-v2) → null, no crash
  assert.equal(domainPeakHour({ x: { domains: { 'b.com': { t: 9, v: 1 } }, hours: [] } }, 'b.com'), null);
});

test('domainHourly sums a site\'s per-hour seconds across days (v2), null without dh', () => {
  const d = {
    '2026-06-21': { domains: { 'a.com': { t: 100, v: 1, dh: { 9: 30, 14: 70 } } }, hours: new Array(24).fill(0) },
    '2026-06-22': { domains: { 'a.com': { t: 50, v: 1, dh: { 14: 50 } } }, hours: new Array(24).fill(0) },
  };
  const h = domainHourly(d, 'a.com');
  assert.equal(h.length, 24);
  assert.equal(h[9], 30);
  assert.equal(h[14], 120);             // 70 + 50
  assert.equal(h[0], 0);
  assert.equal(domainHourly(d, 'missing.com'), null);
  // legacy record without dh (pre-v2) → null, no crash
  assert.equal(domainHourly({ x: { domains: { 'b.com': { t: 9, v: 1 } }, hours: [] } }, 'b.com'), null);
});

test('generateInsights compares periods; keys stay raw for the UI to localize', () => {
  const cur = { '2026-06-21': { domains: { 'github.com': { t: 4000, v: 3 }, 'facebook.com': { t: 1000, v: 2 } }, hours: new Array(24).fill(0) } };
  const prev = { '2026-06-14': { domains: { 'github.com': { t: 1000, v: 1 } }, hours: new Array(24).fill(0) } };
  const ins = generateInsights(cur, prev);
  assert.ok(ins.length > 0);
  assert.ok(ins.some((i) => i.key === 'insight.timeUp')); // 5000 vs 1000
  const topCat = ins.find((i) => i.key === 'insight.topCategory');
  assert.ok(topCat && topCat.vars.cat === 'productivity'); // github dominates
  assert.deepEqual(generateInsights({}, {}), []); // no data → no insights
});
