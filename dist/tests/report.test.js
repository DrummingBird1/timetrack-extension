// Weekly / monthly report: the period rules, the numbers, the HTML (escaped, self-contained) and the
// folder write with rotation (against a fake directory handle).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reportPeriod, buildReport, renderReportHtml } from '../../extension/src/lib/report.js';
import { writeReportToFolder } from '../../extension/src/lib/localbackup.js';
import { dayKey } from '../../extension/src/lib/utils.js';

const rec = (domains) => ({ domains: Object.fromEntries(Object.entries(domains).map(([d, t]) => [d, { t, v: 1 }])), hours: new Array(24).fill(0) });
const env = (over = {}) => ({
  t: (k, v) => (v ? `${k}:${JSON.stringify(v)}` : k), lang: 'en', dir: 'ltr', categoryLabel: (k) => k,
  formatDuration: (s) => `${Math.round(s / 60)}m`, formatDate: (d) => dayKey(d), generatedOn: '2026-03-15', ...over,
});

test('weekly period is the 7 days ending yesterday; monthly is the previous calendar month; ids repeat within a period', () => {
  const wed = new Date(2026, 2, 18);                                   // Wednesday 18 March 2026
  const w = reportPeriod('weekly', wed, 0);
  assert.deepEqual([dayKey(w.from), dayKey(w.to), w.days], ['2026-03-11', '2026-03-17', 7]);
  assert.equal(w.id, reportPeriod('weekly', new Date(2026, 2, 21), 0).id, 'same week -> same id (so it is written once)');
  assert.notEqual(w.id, reportPeriod('weekly', new Date(2026, 2, 22), 0).id, 'next week -> new report due');
  const m = reportPeriod('monthly', new Date(2026, 2, 3));
  assert.deepEqual([dayKey(m.from), dayKey(m.to), m.days], ['2026-02-01', '2026-02-28', 28]);
  const jan = reportPeriod('monthly', new Date(2026, 0, 5));
  assert.deepEqual([dayKey(jan.from), dayKey(jan.to)], ['2025-12-01', '2025-12-31'], 'across the year boundary');
});

test('buildReport totals, averages, ranks sites and compares with the previous period', () => {
  const days = { '2026-03-02': rec({ 'github.com': 3600, 'youtube.com': 1800 }), '2026-03-04': rec({ 'github.com': 1800 }) };
  const prevDays = { '2026-02-25': rec({ 'github.com': 3600 }) };
  const r = buildReport({ days, prevDays, tags: { Work: ['github.com'] }, from: new Date(2026, 2, 2), to: new Date(2026, 2, 8) });
  assert.equal(r.total, 7200);
  assert.equal(r.activeDays, 2);
  assert.equal(r.avgPerActiveDay, 3600);
  assert.equal(r.deltaPct, 100);
  assert.deepEqual(r.sites.map((s) => s.domain), ['github.com', 'youtube.com']);
  assert.deepEqual(r.tags, [{ tag: 'Work', seconds: 5400, sites: 1 }]);
});

test('the HTML is self-contained, escapes names, has no scripts or external requests, and sets language and direction', () => {
  const r = buildReport({ days: { '2026-03-02': rec({ 'a.com': 600 }) }, prevDays: {}, tags: { 'R&D': ['a.com'] }, from: new Date(2026, 2, 2), to: new Date(2026, 2, 8) });
  const html = renderReportHtml(r, env({ lang: 'he', dir: 'rtl' }));
  assert.match(html, /^<!doctype html>/);
  assert.match(html, /<html lang="he" dir="rtl">/);
  assert.ok(html.includes('R&amp;D') && !html.includes('R&D<'), 'tag names are escaped');
  assert.ok(!/<script|https?:\/\/|<link|<img|@import/i.test(html), 'no scripts, no external requests');
  assert.ok(html.includes('a.com') && html.includes('10m'));
});

test('an empty period still renders (the scheduler decides to skip it), without sections for nothing', () => {
  const r = buildReport({ days: {}, prevDays: {}, from: new Date(2026, 2, 2), to: new Date(2026, 2, 8) });
  const html = renderReportHtml(r, env());
  assert.ok(!html.includes('report.topSites') && !html.includes('report.tags'));
});

test('reports are written into the folder and rotated, touching only report files', async () => {
  const files = new Map([
    ['timetrack-report-2026-01-04.html', 'a'], ['timetrack-report-2026-01-11.html', 'b'], ['timetrack-report-2026-01-18.html', 'c'],
    ['timetrack-backup-2026-01-01-0800.json', 'backup'], ['notes.html', 'mine'],
  ]);
  const dir = {
    async getFileHandle(name) { return { async createWritable() { let b = ''; return { async write(s) { b += s; }, async close() { files.set(name, b); } }; } }; },
    async *entries() { for (const n of [...files.keys()]) yield [n, { kind: 'file' }]; },
    async removeEntry(n) { files.delete(n); },
  };
  const r = await writeReportToFolder(dir, 'timetrack-report-2026-01-25.html', '<p>x</p>', { keep: 3 });
  assert.equal(r.removed, 1);
  assert.deepEqual([...files.keys()].sort(), ['notes.html', 'timetrack-backup-2026-01-01-0800.json', 'timetrack-report-2026-01-11.html', 'timetrack-report-2026-01-18.html', 'timetrack-report-2026-01-25.html']);
  await assert.rejects(() => writeReportToFolder(dir, '../evil.html', 'x'), /unexpected/);
});
