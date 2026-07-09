import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  dayKey, parseDayKey, addDays, rangeKeys, keysBetween, startOfWeek,
  hostnameFromUrl, registrableDomain, domainFromUrl,
  formatDuration, formatClock, favicon, setDurationLocale, weekdaysShort, sum, clamp,
} from '../../../extension/src/lib/utils.js';

test('dayKey / parseDayKey round-trip (local, zero-padded)', () => {
  const d = new Date(2026, 0, 5); // 5 Jan 2026
  assert.equal(dayKey(d), '2026-01-05');
  const back = parseDayKey('2026-01-05');
  assert.equal(back.getFullYear(), 2026);
  assert.equal(back.getMonth(), 0);
  assert.equal(back.getDate(), 5);
});

test('addDays does not mutate and crosses month boundaries', () => {
  const d = new Date(2026, 0, 31);
  const next = addDays(d, 1);
  assert.equal(dayKey(next), '2026-02-01');
  assert.equal(dayKey(d), '2026-01-31'); // original untouched
});

test('rangeKeys returns N keys, oldest first, ending today', () => {
  const end = new Date(2026, 5, 22);
  const keys = rangeKeys(7, end);
  assert.equal(keys.length, 7);
  assert.equal(keys[0], '2026-06-16');
  assert.equal(keys[6], '2026-06-22');
});

test('keysBetween is inclusive on both ends', () => {
  const a = new Date(2026, 5, 20);
  const b = new Date(2026, 5, 22);
  assert.deepEqual(keysBetween(a, b), ['2026-06-20', '2026-06-21', '2026-06-22']);
});

test('startOfWeek (Sunday) snaps back to Sunday', () => {
  const wed = new Date(2026, 5, 24); // a Wednesday
  const sow = startOfWeek(wed, 0);
  assert.equal(sow.getDay(), 0);
});

test('hostnameFromUrl strips www and rejects non-web schemes', () => {
  assert.equal(hostnameFromUrl('https://www.example.com/path?q=1'), 'example.com');
  assert.equal(hostnameFromUrl('http://Sub.Example.COM'), 'sub.example.com');
  assert.equal(hostnameFromUrl('chrome://extensions'), null);
  assert.equal(hostnameFromUrl('about:blank'), null);
  assert.equal(hostnameFromUrl('not a url'), null);
});

test('registrableDomain handles simple and multi-part TLDs', () => {
  assert.equal(registrableDomain('mail.google.com'), 'google.com');
  assert.equal(registrableDomain('example.com'), 'example.com');
  assert.equal(registrableDomain('news.bbc.co.uk'), 'bbc.co.uk');
  assert.equal(registrableDomain('foo.ynet.co.il'), 'ynet.co.il');
});

test('domainFromUrl honors the groupSubdomains flag', () => {
  assert.equal(domainFromUrl('https://mail.google.com/u/0', true), 'google.com');
  assert.equal(domainFromUrl('https://mail.google.com/u/0', false), 'mail.google.com');
  assert.equal(domainFromUrl('chrome://newtab', true), null);
});

test('formatDuration switches units with locale', () => {
  setDurationLocale('he');
  assert.equal(formatDuration(3600 + 14 * 60), '1 שע׳ 14 דק׳');
  assert.equal(formatDuration(45), '45 שנ׳');
  setDurationLocale('en');
  assert.equal(formatDuration(3600 + 14 * 60), '1 h 14 m');
  assert.equal(formatDuration(0), '0 s');
  setDurationLocale('he'); // restore
});

test('formatDuration compact is HH:MM:SS / MM:SS', () => {
  assert.equal(formatDuration(3661, { compact: true }), '1:01:01');
  assert.equal(formatDuration(61, { compact: true }), '1:01');
});

test('formatClock pads correctly', () => {
  assert.equal(formatClock(0), '00:00');
  assert.equal(formatClock(3661), '1:01:01');
});

test('favicon is a local data URI, never a network URL', () => {
  const uri = favicon('youtube.com');
  assert.ok(uri.startsWith('data:image/svg+xml,'));
  assert.ok(!/https?:\/\//.test(uri));
  // deterministic for the same domain
  assert.equal(favicon('youtube.com'), uri);
});

test('weekdaysShort returns 7 labels per language', () => {
  assert.equal(weekdaysShort('he').length, 7);
  assert.equal(weekdaysShort('en')[0], 'Su');
});

test('sum and clamp', () => {
  assert.equal(sum([1, 2, 3]), 6);
  assert.equal(sum([]), 0);
  assert.equal(clamp(5, 0, 10), 5);
  assert.equal(clamp(-1, 0, 10), 0);
  assert.equal(clamp(99, 0, 10), 10);
});
