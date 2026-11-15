// Tags (2.0): the stats, the name validator, and the import path that must never let a file
// plant a prototype-polluting or markup-carrying tag.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { installChrome } from './helpers/chrome-storage-mock.js';

installChrome();
const storage = await import('../../extension/src/lib/storage.js');
const { tagSeconds, domainInTag } = await import('../../extension/src/lib/stats.js');
const { cleanTagName } = await import('../../extension/src/lib/utils.js');
const { sanitizeSettings } = await import('../../extension/src/lib/snapshot.js');

beforeEach(() => { installChrome(); });

const rec = (domains) => ({ domains: Object.fromEntries(Object.entries(domains).map(([d, t]) => [d, { t, v: 1 }])), hours: new Array(24).fill(0) });

test('a tag entry matches the site and its subdomains, not look-alikes', () => {
  assert.equal(domainInTag('docs.google.com', 'google.com'), true);
  assert.equal(domainInTag('google.com', 'google.com'), true);
  assert.equal(domainInTag('notgoogle.com', 'google.com'), false);
  assert.equal(domainInTag('google.com', 'docs.google.com'), false);
});

test('tagSeconds sums per tag, lets one site carry several tags, and hides tags with no time', () => {
  const days = { '2026-03-01': rec({ 'github.com': 600, 'docs.google.com': 300, 'youtube.com': 900 }), '2026-03-02': rec({ 'github.com': 100 }) };
  const rows = tagSeconds(days, { Work: ['github.com', 'google.com'], Dev: ['github.com'], Empty: ['nothing.example'] });
  assert.deepEqual(rows, [
    { tag: 'Work', seconds: 1000, sites: 2 },
    { tag: 'Dev', seconds: 700, sites: 1 },
  ]);
  assert.deepEqual(tagSeconds(days, {}), []);
});

test('cleanTagName trims, collapses spaces and refuses markup, long names and prototype keys', () => {
  assert.equal(cleanTagName('  Side   project '), 'Side project');
  for (const bad of ['', '   ', 'x'.repeat(31), '<b>x</b>', 'a&b', 'say "hi"', '__proto__', 'constructor']) assert.equal(cleanTagName(bad), '', JSON.stringify(bad));
});

test('tags can be added and removed through the map-setting helpers (and saveSettings refuses them)', async () => {
  await storage.setSettingsMapEntry('tags', 'Work', ['github.com']);
  assert.deepEqual((await storage.getSettings()).tags, { Work: ['github.com'] });
  await assert.rejects(() => storage.saveSettings({ tags: {} }), /map setting/);
  await storage.removeSettingsMapEntry('tags', 'Work');
  assert.deepEqual((await storage.getSettings()).tags, {});
});

test('importing settings keeps good tags and drops hostile names and bad domains', () => {
  const raw = JSON.parse('{"tags":{"Work":["github.com","not a host",5],"__proto__":["evil.com"],"<img onerror=x>":["a.com"],"Study":"nope"}}');
  const clean = sanitizeSettings(raw, storage.DEFAULT_SETTINGS);
  assert.deepEqual(Object.keys(clean.tags), ['Work']);
  assert.deepEqual(clean.tags.Work, ['github.com']);
  assert.equal(Object.getPrototypeOf(clean.tags), Object.prototype);
  assert.equal(({}).evil, undefined);
});

// ---- "today vs your usual" ----
const { usualForWeekday } = await import('../../extension/src/lib/stats.js');

test('usualForWeekday averages the same weekday over earlier weeks, ignoring empty days, and needs two samples', () => {
  const today = new Date(2026, 2, 18);                         // a Wednesday
  const days = {
    '2026-03-11': rec({ 'a.com': 3600 }),                      // 1 week ago
    '2026-03-04': rec({ 'a.com': 1800, 'b.com': 1800 }),       // 2 weeks ago
    '2026-02-25': rec({}),                                     // 3 weeks ago: nothing tracked
    '2026-03-12': rec({ 'a.com': 9999 }),                      // a Thursday: not the same weekday
  };
  assert.deepEqual(usualForWeekday(days, today), { seconds: 3600, samples: 2 });
  assert.equal(usualForWeekday({ '2026-03-11': rec({ 'a.com': 3600 }) }, today), null, 'one day is not a "usual"');
  assert.equal(usualForWeekday({}, today), null);
  assert.equal(usualForWeekday(days, today, 1), null, 'only one week requested -> one sample');
});

// ---- tag budgets ----
const { tagBudgetStatus } = await import('../../extension/src/lib/stats.js');

test('tagBudgetStatus reports used/limit/percent for budgeted tags that still exist, most used first', () => {
  const days = { '2026-03-02': rec({ 'github.com': 1800, 'youtube.com': 600 }) };
  const tags = { Work: ['github.com'], Fun: ['youtube.com'] };
  const rows = tagBudgetStatus(days, tags, { Work: 60, Fun: 5, Gone: 10, Zero: 0 });
  assert.deepEqual(rows.map((r) => [r.key, r.usedSeconds, r.limitSeconds, Math.round(r.pct)]), [['Fun', 600, 300, 200], ['Work', 1800, 3600, 50]]);
});

test('importing settings keeps sane tag budgets and drops hostile or non-positive ones', () => {
  const raw = JSON.parse('{"tagBudgets":{"Work":90,"__proto__":5,"<b>":5,"Neg":-3,"Huge":999999,"Str":"x"}}');
  const clean = sanitizeSettings(raw, storage.DEFAULT_SETTINGS);
  assert.deepEqual(clean.tagBudgets, { Work: 90 });
  assert.equal(Object.getPrototypeOf(clean.tagBudgets), Object.prototype);
});

test('tagBudgets is a map setting: only the entry helpers can change it', async () => {
  await assert.rejects(() => storage.saveSettings({ tagBudgets: { Work: 5 } }), /map setting/);
  await storage.setSettingsMapEntry('tagBudgets', 'Work', 5);
  assert.deepEqual((await storage.getSettings()).tagBudgets, { Work: 5 });
});
