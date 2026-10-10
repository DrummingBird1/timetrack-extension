// parseUsageCsv() turns a CSV from another tracker (or TimeTrack's own export) into day
// records. It must be tolerant about headers and date formats, and honest about
// what it skipped.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, parseUsageCsv } from '../../extension/src/lib/csvimport.js';

test('parseCsv handles quotes, embedded commas, escaped quotes, CRLF and a trailing newline', () => {
  const rows = parseCsv('a,b,c\r\n"x, y","say ""hi""",z\r\n\r\n');
  assert.deepEqual(rows, [['a', 'b', 'c'], ['x, y', 'say "hi"', 'z']]);
});

test("TimeTrack's own export round-trips", () => {
  const csv = '﻿"date","domain","category","seconds","minutes","visits"\n"2026-03-01","github.com","productivity","600","10.0","3"\n"2026-03-01","youtube.com","entertainment","300","5.0","1"\n"2026-03-02","github.com","productivity","60","1.0","1"\n';
  const r = parseUsageCsv(csv);
  assert.equal(r.rows, 3);
  assert.equal(r.skipped, 0);
  assert.equal(r.days['2026-03-01'].domains['github.com'].t, 600);
  assert.equal(r.days['2026-03-01'].domains['github.com'].v, 3);
  assert.equal(r.days['2026-03-02'].domains['github.com'].t, 60);
});

test('RescueTime-style export: aliased headers, hourly timestamps feed the hour breakdown, non-site rows are skipped', () => {
  const csv = [
    'Date,Time Spent (seconds),Number of People,Activity,Category,Productivity',
    '2026-03-02T09:00:00,600,1,github.com,Software Development,2',
    '2026-03-02T09:00:00,120,1,Slack,General Communication,1',
    '2026-03-02T10:00:00,300,1,github.com,Software Development,2',
    '2026-03-02T10:00:00,90,1,docs.google.com,Editing,1',
  ].join('\n');
  const r = parseUsageCsv(csv);
  assert.equal(r.format, 'rescuetime');
  assert.equal(r.rows, 3);
  assert.equal(r.skipped, 1, '"Slack" is an app, not a website');
  const day = r.days['2026-03-02'];
  assert.equal(day.domains['github.com'].t, 900);
  assert.deepEqual(day.domains['github.com'].dh, { 9: 600, 10: 300 });
  assert.equal(day.hours[9], 600);
  assert.equal(day.hours[10], 390);
  assert.equal(day.domains['docs.google.com'].t, 90);
});

test('minutes or hours columns are converted to seconds', () => {
  const byMinutes = parseUsageCsv('Day,Website,Time Spent (minutes)\n2026-03-05,example.com,2.5\n');
  assert.equal(byMinutes.days['2026-03-05'].domains['example.com'].t, 150);
  const byHours = parseUsageCsv('date,site,hours\n2026-03-05,example.com,0.5\n');
  assert.equal(byHours.days['2026-03-05'].domains['example.com'].t, 1800);
});

test('date formats: ISO with time, space-separated, slashes', () => {
  const r = parseUsageCsv('date,domain,seconds\n2026-03-05 14:30:00,a.com,60\n2026/03/06,b.com,30\n2026-03-07T00:00:00Z,c.com,10\n');
  assert.deepEqual(Object.keys(r.days).sort(), ['2026-03-05', '2026-03-06', '2026-03-07']);
  assert.equal(r.days['2026-03-05'].hours[14], 60);
});

test('domains are normalized (scheme, path, www, case); rows are summed per day+domain', () => {
  const r = parseUsageCsv('date,domain,seconds\n2026-03-05,https://WWW.Example.com/page?x=1,60\n2026-03-05,example.com,40\n');
  assert.equal(r.days['2026-03-05'].domains['example.com'].t, 100);
  assert.equal(r.rows, 2);
});

test('bad rows are skipped and counted, not fatal', () => {
  const r = parseUsageCsv('date,domain,seconds\nnot-a-date,a.com,60\n2026-03-05,a.com,-5\n2026-03-05,a.com,abc\n2026-03-05,,10\n2026-03-05,ok.com,10\n');
  assert.equal(r.rows, 1);
  assert.equal(r.skipped, 4);
  assert.deepEqual(Object.keys(r.days['2026-03-05'].domains), ['ok.com']);
});

test('a CSV without usable columns or rows fails with a specific error code', () => {
  assert.throws(() => parseUsageCsv('foo,bar\n1,2\n'), (e) => e.code === 'NO_COLUMNS');
  assert.throws(() => parseUsageCsv(''), (e) => e.code === 'NO_COLUMNS');
  assert.throws(() => parseUsageCsv('date,domain,seconds\nbad,x,y\n'), (e) => e.code === 'NO_ROWS');
});
