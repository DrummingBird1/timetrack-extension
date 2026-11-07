// parseUsageCsv() turns a CSV from another tracker (or TimeTrack's own export) into day
// records. It must be tolerant about headers and date formats, and honest about
// what it skipped.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, parseUsageCsv, detectDelimiter } from '../../extension/src/lib/csvimport.js';

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

// ---------------------------------------------------------------- 1.7: spreadsheets in other locales
test('a semicolon-separated file with decimal commas (Excel in Hebrew, Russian, French, Spanish) imports', () => {
  const csv = 'date;domain;minutes\r\n2026-03-05;example.com;1,5\r\n2026-03-05;news.example.org;12\r\n2026-03-06;example.com;1.234,5\r\n';
  const { days, rows, skipped } = parseUsageCsv(csv);
  assert.equal(rows, 3);
  assert.equal(skipped, 0);
  assert.equal(days['2026-03-05'].domains['example.com'].t, 90, '1,5 minutes is 90 seconds, not 15 minutes');
  assert.equal(days['2026-03-06'].domains['example.com'].t, 74070, '1.234,5 minutes');
});

test('a tab-separated file works too, and a comma file reads "1,5" as a decimal and "1,234" as thousands', () => {
  assert.equal(detectDelimiter('date\tdomain\tseconds\n'), '\t');
  assert.equal(detectDelimiter('"date","domain","seconds"\n'), ',');
  assert.equal(detectDelimiter('date;domain;seconds\n'), ';');
  const tsv = parseUsageCsv('date\tdomain\tseconds\n2026-03-05\texample.com\t120\n');
  assert.equal(tsv.days['2026-03-05'].domains['example.com'].t, 120);
  const comma = parseUsageCsv('date,domain,minutes\n2026-03-05,a.example.com,"1,5"\n2026-03-05,b.example.com,"1,234"\n');
  assert.equal(comma.days['2026-03-05'].domains['a.example.com'].t, 90);
  assert.equal(comma.days['2026-03-05'].domains['b.example.com'].t, 74040);
});

test('numbers that are not plain durations are skipped: Infinity, exponents, more than a day, impossible dates', () => {
  const csv = [
    'date,domain,seconds',
    '2026-03-05,ok.example.com,60',
    '2026-03-05,inf.example.com,Infinity',
    '2026-03-05,exp.example.com,1e12',
    '2026-03-05,long.example.com,100000',
    '2026-02-31,date.example.com,60',
    '2026-03-05,neg.example.com,-5',
  ].join('\n');
  const { days, rows, skipped } = parseUsageCsv(csv);
  assert.equal(rows, 1);
  assert.equal(skipped, 5);
  assert.deepEqual(Object.keys(days['2026-03-05'].domains), ['ok.example.com']);
});

test('localhost and IP addresses import (a TimeTrack export of them used to lose those rows); bare app names do not', () => {
  const csv = 'date,domain,seconds\n2026-03-05,localhost,60\n2026-03-05,192.168.1.5,60\n2026-03-05,http://localhost:3000/x,30\n2026-03-05,Visual Studio Code,60\n2026-03-05,notepad,60\n';
  const { days, skipped } = parseUsageCsv(csv);
  assert.deepEqual(Object.keys(days['2026-03-05'].domains).sort(), ['192.168.1.5', 'localhost']);
  assert.equal(days['2026-03-05'].domains.localhost.t, 90);
  assert.equal(skipped, 2);
});
