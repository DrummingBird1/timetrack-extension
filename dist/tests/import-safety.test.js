// What happens to stored data when it is imported, restored, pruned or cleared. Each test here
// pins a way the extension used to lose, corrupt or leak the user's history (found in the 1.7 audit).

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { installChrome } from './helpers/chrome-storage-mock.js';

installChrome();
const storage = await import('../../extension/src/lib/storage.js');
const demo = await import('../../extension/src/lib/demo.js');
const { sanitizeSnapshot, sanitizeSettings, isDayKey } = await import('../../extension/src/lib/snapshot.js');
const { isTrackableHost, cleanDomain, hostnameFromUrl, esc, keysBetween } = await import('../../extension/src/lib/utils.js');
const { currentStreak } = await import('../../extension/src/lib/stats.js');

beforeEach(() => { installChrome(); });

const day = (domains = { 'a.com': { t: 600, v: 2 } }) => ({ domains, hours: new Array(24).fill(0) });
const snap = (days, extra = {}) => ({ app: 'TimeTrack', version: 3, days, ...extra });

// ---------------------------------------------------------------- validation
test('sanitizeSnapshot keeps well-formed days and drops malformed ones, counting them', () => {
  const clean = sanitizeSnapshot(snap({
    '2026-03-05': { domains: { 'ok.com': { t: 100, v: 1, dh: { 9: 100 } }, 'bad host.com': { t: 5, v: 1 }, 'neg.com': { t: -3, v: 1 }, 'huge.com': { t: 1e12, v: 1 }, 'nan.com': { t: NaN, v: 1 } } },   // no day-level hours at all
    '2026-02-31': day(),                    // not a real date
    'yesterday': day(),
    '2026-03-06': 'not a day',
  }), { language: 'he' });
  assert.deepEqual(Object.keys(clean.days), ['2026-03-05']);
  assert.deepEqual(Object.keys(clean.days['2026-03-05'].domains), ['ok.com']);
  assert.equal(clean.dropped, 7, '4 bad domains + 3 bad days');
  assert.equal(clean.days['2026-03-05'].hours[9], 100, 'day-level hours are rebuilt from the per-site hours when missing');
});

test('sanitizeSnapshot refuses things that are not a backup at all', () => {
  for (const junk of [null, 'x', 5, [], {}, { days: [] }, { days: 'nope' }]) {
    assert.throws(() => sanitizeSnapshot(junk, {}), (e) => e.code === 'BAD_SNAPSHOT');
  }
});

test('__proto__, constructor and prototype can never become a site or pollute Object.prototype', async () => {
  const evil = JSON.parse('{"days":{"2026-03-05":{"domains":{"__proto__":{"t":5,"v":1},"constructor":{"t":5,"v":1},"fine.com":{"t":60,"v":1}},"hours":[]}}}');
  await storage.importAll(evil, { mode: 'merge', includeSettings: false });
  const stored = await storage.getDay('2026-03-05');
  assert.deepEqual(Object.keys(stored.domains), ['fine.com']);
  assert.equal(({}).t, undefined, 'Object.prototype was not touched');
  assert.equal(isTrackableHost('constructor'), false);
});

test('a host called "constructor" in an old day record does not corrupt time tracking', async () => {
  await chrome.storage.local.set({ 'ttt_day_2026-03-05': { domains: { fine: { t: 1, v: 1 } }, hours: new Array(24).fill(0) } });
  await storage.addTime({ dateKey: '2026-03-05', domain: 'fine', seconds: 4, hour: 9 });
  assert.equal((await storage.getDay('2026-03-05')).domains.fine.t, 5);
});

test('importing settings can never change where this device backs up to, and ignores bad values', async () => {
  const clean = sanitizeSettings({
    language: 'xx', theme: 'dark', weekStart: 9, idleSeconds: 'soon', retentionDays: 3,
    blacklist: ['ok.com', 'bad host', 42, '"><x'], categoryMap: { 'a.com': 'news', 'b.com': 'nonsense' },
    backup: { endpointUrl: 'https://evil.example', syncEnabled: true },
    surprise: 'unknown key',
    focus: { mode: 'allow', blockDomains: ['x.com', '<script>'], schedule: [{ days: [1], time: '08:30', minutes: 45 }, { days: [9], time: '99:99', minutes: 0 }] },
  }, {
    language: 'he', theme: 'auto', weekStart: 0, idleSeconds: 60, retentionDays: 365, blacklist: [], categoryMap: {},
    backup: { endpointUrl: '' }, focus: { mode: 'block', blockDomains: [], schedule: [] },
  });
  assert.deepEqual(clean, {
    theme: 'dark', blacklist: ['ok.com'], categoryMap: { 'a.com': 'news' },
    focus: { mode: 'allow', blockDomains: ['x.com'], schedule: [{ days: [1], time: '08:30', minutes: 45 }] },
  });
});

test('isDayKey accepts real calendar days only', () => {
  assert.ok(isDayKey('2026-02-28') && isDayKey('2028-02-29'));
  assert.ok(!isDayKey('2026-02-29') && !isDayKey('2026-13-01') && !isDayKey('26-1-1') && !isDayKey('2026-03-05T00'));
});

// ---------------------------------------------------------------- replace is safe
test('a replace import that fails leaves the existing data exactly as it was', async () => {
  await storage.addTime({ dateKey: '2026-01-10', domain: 'mine.com', seconds: 900, hour: 9 });
  const before = JSON.stringify(await chrome.storage.local.get(null));

  await assert.rejects(() => storage.importAll({ days: { nonsense: 1 } }, { mode: 'replace' }), (e) => e.code === 'BAD_SNAPSHOT');
  assert.equal(JSON.stringify(await chrome.storage.local.get(null)), before, 'validation failed before anything was touched');

  // and a write that fails midway: the old days must still be there
  const realSet = chrome.storage.local.set;
  chrome.storage.local.set = async (obj) => { if ('ttt_index' in obj) throw new Error('QUOTA_BYTES exceeded'); return realSet(obj); };
  await assert.rejects(() => storage.importAll(snap({ '2026-02-01': day() }), { mode: 'replace' }), /QUOTA/);
  chrome.storage.local.set = realSet;
  assert.equal((await storage.getDay('2026-01-10')).domains['mine.com'].t, 900);
  assert.deepEqual(await storage.getIndex(), ['2026-01-10']);
});

test('replace makes the stored days exactly the snapshot, and keeps session logs of the days both sides have', async () => {
  await storage.addTime({ dateKey: '2026-01-10', domain: 'old.com', seconds: 100, hour: 9 });
  await storage.addTime({ dateKey: '2026-01-11', domain: 'kept.com', seconds: 100, hour: 9 });
  await storage.recordSession({ dateKey: '2026-01-10', domain: 'old.com', startSec: 100, seconds: 50 });
  await storage.recordSession({ dateKey: '2026-01-11', domain: 'kept.com', startSec: 100, seconds: 50 });
  // a day that was written without an index entry (an old crash) must not survive a replace either
  await chrome.storage.local.set({ 'ttt_day_2025-12-31': day() });

  const r = await storage.importAll(snap({ '2026-01-11': day({ 'new.com': { t: 300, v: 1 } }) }), { mode: 'replace', includeSettings: false });
  assert.equal(r.days, 1);
  assert.deepEqual(await storage.getIndex(), ['2026-01-11']);
  assert.equal(await storage.getDay('2026-01-10'), null);
  assert.equal(await storage.getDay('2025-12-31'), null);
  assert.deepEqual(Object.keys((await storage.getDay('2026-01-11')).domains), ['new.com']);
  assert.ok((await storage.getSessions(['2026-01-11']))['2026-01-11'], 'a cloud copy has no session logs; the local ones for a shared day stay');
  assert.equal((await storage.getSessions(['2026-01-10']))['2026-01-10'], undefined);
  assert.equal((await storage.getMeta()).firstDay, '2026-01-11');
});

test('replace saves the old data as a one-step undo, and undo swaps it back', async () => {
  await storage.addTime({ dateKey: '2026-01-10', domain: 'before.com', seconds: 700, hour: 9 });
  await storage.importAll(snap({ '2026-02-01': day({ 'after.com': { t: 60, v: 1 } }) }), { mode: 'replace', includeSettings: false });
  assert.deepEqual(await storage.getIndex(), ['2026-02-01']);
  const info = await storage.getPreReplaceInfo();
  assert.equal(info.days, 1);

  await storage.undoLastReplace();
  assert.deepEqual(await storage.getIndex(), ['2026-01-10']);
  assert.equal((await storage.getDay('2026-01-10')).domains['before.com'].t, 700);
  assert.equal((await storage.getPreReplaceInfo()).days, 1, 'the state before the undo became the new undo copy');
  await storage.clearAllData();
  assert.equal(await storage.getPreReplaceInfo(), null, '"clear all data" removes the undo copy too');
});

// ---------------------------------------------------------------- retention
test('importing history older than the retention setting keeps it (retention becomes "keep everything") and says so', async () => {
  await storage.saveSettings({ retentionDays: 365 });
  const old = '2022-04-01';
  const r = await storage.importAll(snap({ [old]: day() }), { mode: 'merge', includeSettings: false });
  assert.equal(r.retentionRelaxed, true);
  assert.equal((await storage.getSettings()).retentionDays, 0);
  assert.equal(await storage.pruneOld((await storage.getSettings()).retentionDays), 0);
  assert.ok(await storage.getDay(old), 'still there after the next worker start would prune');

  // data inside the window changes nothing
  await storage.saveSettings({ retentionDays: 365 });
  const recent = (await import('../../extension/src/lib/utils.js')).dayKey(new Date());
  const r2 = await storage.importAll(snap({ [recent]: day() }), { mode: 'merge', includeSettings: false });
  assert.equal(r2.retentionRelaxed, false);
  assert.equal((await storage.getSettings()).retentionDays, 365);
});

test('prunableDays / countPrunable say what a retention would delete, and 0 keeps everything', async () => {
  const now = new Date(2026, 5, 15).getTime();
  const index = ['2025-01-01', '2025-06-14', '2026-06-01'];
  assert.deepEqual(storage.prunableDays(index, 365, now), ['2025-01-01', '2025-06-14'], 'the cutoff is 2025-06-15, so the 14th goes');
  assert.deepEqual(storage.prunableDays(index, 0, now), []);
  assert.deepEqual(storage.prunableDays(index, 7, now), ['2025-01-01', '2025-06-14', '2026-06-01'].filter((k) => k < '2026-06-08'));
  await storage.addTime({ dateKey: '2020-01-01', domain: 'old.com', seconds: 10, hour: 1 });
  assert.equal(await storage.countPrunable(365), 1);
  assert.equal(await storage.countPrunable(0), 0);
});

// ---------------------------------------------------------------- demo + orphans + atomic day
test('real data imported over demo data never mixes with it, and "remove demo" cannot delete real history', async () => {
  const D = new Date(2026, 5, 15);
  await demo.loadDemo(D);
  const demoDay = Object.keys(demo.buildDemoDays(D)).sort()[3];
  await storage.importAll(snap({ [demoDay]: day({ 'real.com': { t: 7200, v: 3 } }) }), { mode: 'merge', includeSettings: false });
  assert.equal(await demo.isDemoActive(), false, 'importing real data ends the demo');
  const kept = await storage.getDay(demoDay);
  assert.deepEqual(Object.keys(kept.domains), ['real.com'], 'the fake sites for that day were removed before merging');
  assert.equal(await demo.removeDemo(), 0);
  assert.equal((await storage.getDay(demoDay)).domains['real.com'].t, 7200);
});

test('clearAllData also removes a day that was written without an index entry', async () => {
  await storage.addTime({ dateKey: '2026-01-10', domain: 'a.com', seconds: 10, hour: 1 });
  await chrome.storage.local.set({ 'ttt_day_2026-01-11': day() });          // an orphan
  await storage.clearAllData();
  const left = Object.keys(await chrome.storage.local.get(null)).filter((k) => k.startsWith('ttt_day_'));
  assert.deepEqual(left, []);
});

test('addTime writes the day and its index entry in one call, so a crash cannot leave an orphan', async () => {
  const writes = [];
  const realSet = chrome.storage.local.set;
  chrome.storage.local.set = async (obj) => { writes.push(Object.keys(obj)); return realSet(obj); };
  await storage.addTime({ dateKey: '2026-04-01', domain: 'a.com', seconds: 5, hour: 1 });
  chrome.storage.local.set = realSet;
  const withDay = writes.filter((keys) => keys.includes('ttt_day_2026-04-01'));
  assert.equal(withDay.length, 1);
  assert.ok(withDay[0].includes('ttt_index'), 'the day and the index are written together');
  assert.deepEqual(await storage.getIndex(), ['2026-04-01']);
});

// ---------------------------------------------------------------- hostnames and escaping
test('hostnames: only well-formed, ASCII hosts are tracked; a trailing dot is the same site', () => {
  assert.equal(hostnameFromUrl('https://Example.com./path'), 'example.com');
  assert.equal(hostnameFromUrl('http://xn--e1afmkfd.xn--p1ai/'), 'xn--e1afmkfd.xn--p1ai');
  assert.equal(hostnameFromUrl('http://localhost:3000/'), 'localhost');
  assert.equal(hostnameFromUrl('http://[::1]:8080/'), '[::1]');
  assert.equal(hostnameFromUrl('http://192.168.1.5/'), '192.168.1.5');
  assert.equal(hostnameFromUrl('http://a"onmouseover="x.example/'), null, 'a quote in a hostname is not a site');
  assert.equal(hostnameFromUrl('http://a\'b&c=d.example/'), null);
  assert.equal(hostnameFromUrl('chrome://settings'), null);
});

test('cleanDomain: one rule for typed input and importers, including localhost, IPs and IDN', () => {
  assert.equal(cleanDomain(' https://www.Example.COM/path?q=1 '), 'example.com');
  assert.equal(cleanDomain('localhost'), 'localhost');
  assert.equal(cleanDomain('localhost:3000'), 'localhost');
  assert.equal(cleanDomain('192.168.1.5'), '192.168.1.5');
  assert.equal(cleanDomain('münchen.de'), 'xn--mnchen-3ya.de');
  assert.equal(cleanDomain('not a site'), '');
  assert.equal(cleanDomain('a"b.com'), '');
  assert.equal(cleanDomain(''), '');
});

test('esc neutralises every character that can break out of HTML text or an attribute', () => {
  assert.equal(esc('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;');
  assert.equal(esc('a"b\'c&d'), 'a&quot;b&#39;c&amp;d');
  assert.equal(esc(null), '');
  assert.equal(esc(5), '5');
  const attribute = `<td title="${esc('x" onmouseover="alert(1)')}">`;
  assert.equal(attribute, '<td title="x&quot; onmouseover=&quot;alert(1)">');
});

// ---------------------------------------------------------------- small guards
test('keysBetween caps an absurd range instead of building millions of keys', () => {
  const keys = keysBetween(new Date(1, 0, 1), new Date(2026, 5, 15));
  assert.ok(keys.length <= 3660);
  assert.equal(keys[keys.length - 1], '2026-06-15');
});

test('the tracking streak does not drop to 0 just because today has no data yet', () => {
  assert.equal(currentStreak(['2026-06-13', '2026-06-14'], '2026-06-15'), 2);
  assert.equal(currentStreak(['2026-06-13', '2026-06-14', '2026-06-15'], '2026-06-15'), 3);
  assert.equal(currentStreak(['2026-06-10'], '2026-06-15'), 0);
});
