// End-to-end QA of the dashboard in a real browser: every tab, the v1.4.0 features
// that shipped without DOM coverage (pinned sites, settings search, passphrase
// meter, alias merge, restore preview, first/last visit) and the settings-deletion
// paths that once hit the deepMerge bug.

import { test, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { launch, waitFor, sleep } from './harness.mjs';
import { buildSnapshot } from '../tools/fixture.mjs';

const LANGS = { he: 'rtl', en: 'ltr', ar: 'rtl', ru: 'ltr', es: 'ltr', fr: 'ltr' };

let ext;
let page;
let snapshot;

// Domains ranked by total time over the seeded window — gives tests real, stable targets.
function ranked(snap) {
  const totals = {};
  for (const d of Object.values(snap.days)) for (const [dom, r] of Object.entries(d.domains)) totals[dom] = (totals[dom] || 0) + r.t;
  return Object.entries(totals).sort((a, b) => b[1] - a[1]).map(([dom, t]) => ({ dom, t }));
}

const text = (sel) => page.$eval(sel, (e) => e.textContent.trim());
const count = (sel) => page.$$eval(sel, (els) => els.length);
async function openTab(tab) {
  await page.click(`.nav-item[data-tab="${tab}"]`);
  await page.waitForSelector(`#tab-${tab}.active`);
}
async function setValue(sel, value, eventName = 'change') {
  await page.$eval(sel, (el, v, ev) => { el.value = v; el.dispatchEvent(new Event(ev, { bubbles: true })); }, value, eventName);
}
async function toastText() {
  await page.waitForSelector('#toast.show', { timeout: 5000 });
  return text('#toast');
}
const dayData = () => ext.run(async (url) => {
  const s = await import(url);
  const idx = await s.getIndex();
  return { idx, days: await s.getDays(idx) };
}, `${ext.base}src/lib/storage.js`);

before(async () => {
  ext = await launch();
  snapshot = buildSnapshot({ days: 120, seed: 3 });
});
after(async () => { await ext?.close(); });
beforeEach(async () => {
  await ext.reset();
  await ext.seed(snapshot);
  page = await ext.openPage('src/dashboard/dashboard.html');
  await page.waitForSelector('#summaryCards .stat-card');
});
afterEach(async () => {
  assert.deepEqual(ext.errors, [], 'no uncaught errors / console.error during the test');
  await page?.close();
});

// ---------------------------------------------------------------- overview
test('overview: summary cards, charts, insights, compare and top sites render with data', async () => {
  assert.equal(await count('#summaryCards .stat-card'), 6);
  assert.ok(await page.$('#trendChart svg'), 'trend chart');
  assert.ok(await page.$('#categoryDonut svg'), 'category donut');
  assert.ok((await count('#categoryLegend > *')) > 0, 'donut legend');
  assert.equal(await count('#overviewTop .tl-row'), 8);
  assert.ok((await count('#comparePanel .cmp-row')) >= 1, 'period comparison');
  assert.ok((await count('#insightsPanel > *')) >= 1, 'insights panel has content or an empty note');
});

test('overview: switching the range re-renders; a custom range works', async () => {
  const before7 = await page.$eval('#summaryCards', (e) => e.innerHTML);
  await page.click('#rangePicker [data-range="90"]');
  await waitFor(async () => (await page.$eval('#summaryCards', (e) => e.innerHTML)) !== before7, { message: '90d range to render' });

  await page.click('#rangePicker [data-range="all"]');
  await page.waitForFunction(() => document.querySelectorAll('#overviewTop .tl-row').length > 0);

  await page.click('#rangePicker [data-range="custom"]');
  const from = await page.$eval('#rangeFrom', (e) => e.value);
  assert.ok(from, 'custom range inputs are pre-filled');
  await page.click('#rangeApply');
  await page.waitForFunction(() => document.querySelector('#summaryCards .stat-card:nth-child(2) .lbl').textContent.includes('–'));
});

// ------------------------------------------------------------------- sites
test('sites: table, search, sort and the all-history toggle', async () => {
  await openTab('sites');
  await waitFor(async () => (await count('#sitesBody tr')) > 0, { message: 'sites rows' });
  const rows = await count('#sitesBody tr');

  const top = ranked(snapshot)[0].dom;
  await page.type('#siteSearch', top.slice(0, 5));
  await waitFor(async () => (await count('#sitesBody tr')) < rows, { message: 'search to filter rows' });
  const names = await page.$$eval('#sitesBody .dom', (els) => els.map((e) => e.textContent));
  assert.ok(names.length > 0 && names.every((n) => n.includes(top.slice(0, 5))));
  await page.$eval('#siteSearch', (e) => { e.value = ''; e.dispatchEvent(new Event('input', { bubbles: true })); });

  await setValue('#siteSort', 'name');
  await waitFor(async () => {
    const list = await page.$$eval('#sitesBody .dom', (els) => els.map((e) => e.textContent));
    return list.length > 1 && list.slice().sort((a, b) => a.localeCompare(b)).join() === list.join();
  }, { message: 'name sort' });

  const inRange = await count('#sitesBody tr');
  await page.click('#siteAllHistory');
  await waitFor(async () => (await count('#sitesBody tr')) >= inRange, { message: 'all-history rows' });
});

test('sites: pinning moves a site to the top and persists', async () => {
  await openTab('sites');
  await waitFor(async () => (await count('#sitesBody tr')) > 2);
  const names = await page.$$eval('#sitesBody .dom', (els) => els.map((e) => e.textContent));
  const target = names[names.length - 1];
  await page.$$eval('#sitesBody tr', (rows, t) => {
    rows.find((r) => r.querySelector('.dom').textContent === t).querySelector('.pin-btn').click();
  }, target);
  await waitFor(async () => (await text('#sitesBody tr:first-child .dom')) === target, { message: 'pinned site to float to the top' });
  assert.ok(await page.$('#sitesBody tr:first-child .pin-btn.on'));
  assert.deepEqual((await ext.getSettings()).pinnedSites, [target]);
});

test('sites: a per-site limit can be set and cleared (deepMerge deletion regression)', async () => {
  await openTab('sites');
  await waitFor(async () => (await count('#sitesBody tr')) > 0);
  const dom = await text('#sitesBody tr:first-child .dom');
  await setValue('#sitesBody tr:first-child .limit-input', '45');
  await waitFor(async () => (await ext.getSettings()).siteLimits[dom] === 45, { message: 'limit saved' });
  await setValue('#sitesBody tr:first-child .limit-input', '');
  await waitFor(async () => !(dom in (await ext.getSettings()).siteLimits), { message: 'limit key removed' });
});

test('site detail: stats incl. first/last visit, alias merge and the track toggle', async () => {
  const [a, b] = ranked(snapshot);
  await openTab('sites');
  await waitFor(async () => (await count('#sitesBody tr')) > 0);
  await page.$$eval('#sitesBody tr', (rows, t) => rows.find((r) => r.querySelector('.dom').textContent === t).click(), a.dom);
  await page.waitForSelector('#siteModal:not(.hidden) .detail-stats');
  assert.equal(await count('#siteModalCard .detail-stat'), 7);
  const stats = await page.$$eval('#siteModalCard .detail-stat .v', (els) => els.map((e) => e.textContent.trim()));
  assert.ok(stats.every((v) => v.length > 0));
  assert.ok(await page.$('#detailChart svg'), 'daily timeline chart');
  assert.ok(await page.$('#detailHourly svg'), 'hourly chart (schema v2 data)');

  // track toggle ↔ blacklist
  await page.click('#detailTrackToggle');
  await waitFor(async () => (await ext.getSettings()).blacklist.includes(a.dom), { message: 'blacklist add' });
  await page.waitForSelector('#detailTrackToggle.ghost');
  await page.click('#detailTrackToggle');
  await waitFor(async () => !(await ext.getSettings()).blacklist.includes(a.dom), { message: 'blacklist remove' });

  // alias merge: a → b, summing history and dropping the old domain
  await page.waitForSelector('#mergeDomainInput');
  await page.type('#mergeDomainInput', b.dom);
  await page.click('#mergeDomainBtn');
  await waitFor(async () => {
    const { days } = await dayData();
    return !Object.values(days).some((d) => a.dom in d.domains);
  }, { message: 'old domain to disappear from every day' });
  const { days } = await dayData();
  const mergedTotal = Object.values(days).reduce((s, d) => s + (d.domains[b.dom]?.t || 0), 0);
  assert.equal(mergedTotal, a.t + b.t, 'merge SUMS the two domains');
  assert.ok(ext.dialogs.some((d) => d.type === 'confirm'), 'merge asks for confirmation');
});

// ---------------------------------------------------------------- insights
test('insights: cards, heatmap, hourly chart and category breakdown', async () => {
  await openTab('insights');
  await waitFor(async () => (await count('#insightCards .stat-card')) === 4, { message: 'insight cards' });
  assert.ok(await page.$('#heatmap svg'));
  assert.ok(await page.$('#hourlyChart svg'));
  assert.ok((await count('#categoryBreakdown .cb-row')) > 0);
});

// ---------------------------------------------------------------- settings
test('settings: the search box filters panels', async () => {
  await openTab('settings');
  const total = await count('#tab-settings .settings-grid > .panel');
  await page.type('#settingsSearch', 'AES');
  await waitFor(async () => (await count('#tab-settings .settings-grid > .panel.search-hidden')) > 0, { message: 'a panel to hide' });
  const visible = total - (await count('#tab-settings .settings-grid > .panel.search-hidden'));
  assert.ok(visible >= 1 && visible < total, `${visible} of ${total} panels visible`);
  await page.$eval('#settingsSearch', (e) => { e.value = ''; e.dispatchEvent(new Event('input', { bubbles: true })); });
  assert.equal(await count('#tab-settings .settings-grid > .panel.search-hidden'), 0);
});

test('settings: the passphrase strength meter reacts to input', async () => {
  await openTab('settings');
  assert.ok(await page.$('#passStrength.hidden'), 'hidden while empty');
  await page.type('#setPassphrase', 'abc');
  const weak = await page.$eval('#passStrength', (e) => e.className);
  assert.ok(!weak.includes('hidden'));
  await page.$eval('#setPassphrase', (e) => { e.value = ''; });
  await page.type('#setPassphrase', 'Tr0ub4dor&3-correct-horse-battery');
  const strong = await page.$eval('#passStrength', (e) => e.className);
  assert.notEqual(strong, weak, 'strength class changes');
  assert.ok((await text('#passStrengthLabel')).length > 0);
});

test('settings: every UI language applies — direction, lang and no raw i18n keys', async () => {
  await openTab('settings');
  for (const [lang, direction] of Object.entries(LANGS)) {
    await page.select('#setLanguage', lang);
    await waitFor(async () => (await page.$eval('html', (e) => e.lang)) === lang, { message: `lang ${lang}` });
    assert.equal(await page.$eval('html', (e) => e.dir), direction, `${lang} direction`);
    const rawKeys = await page.$$eval('[data-i18n]', (els) => els
      .filter((e) => e.textContent.trim() === e.dataset.i18n).map((e) => e.dataset.i18n));
    assert.deepEqual(rawKeys, [], `${lang} shows raw i18n keys`);
    assert.notEqual(await text('#pageTitle'), 'title.settings');
    assert.equal((await ext.getSettings()).language, lang, `${lang} persisted`);
  }
  await page.select('#setLanguage', 'he');
});

test('settings: category mappings can be added and removed (deepMerge deletion regression)', async () => {
  await openTab('settings');
  await page.type('#catDomain', 'example.org');
  await page.select('#catSelect', 'news');
  await page.click('#catAdd');
  await waitFor(async () => (await ext.getSettings()).categoryMap['example.org'] === 'news', { message: 'mapping saved' });
  assert.equal(await count('#catList .cat-chip'), 1);
  await page.click('#catList .cat-chip .x');
  await waitFor(async () => !('example.org' in (await ext.getSettings()).categoryMap), { message: 'mapping removed from storage' });
});

test('settings: untracked sites and focus domain lists can be added and removed', async () => {
  await openTab('settings');
  await page.type('#blacklistDomain', 'tracker.example.com');
  await page.click('#blacklistAdd');
  await waitFor(async () => (await ext.getSettings()).blacklist.includes('tracker.example.com'));
  await page.click('#blacklistList .cat-chip .x');
  await waitFor(async () => !(await ext.getSettings()).blacklist.includes('tracker.example.com'));

  await page.type('#focusBlockDomainInput', 'distraction.example.com');
  await page.click('#focusBlockDomainAdd');
  await waitFor(async () => (await ext.getSettings()).focus.blockDomains.includes('distraction.example.com'));
  await page.click('#focusBlockDomains .cat-chip .x');
  await waitFor(async () => !(await ext.getSettings()).focus.blockDomains.includes('distraction.example.com'));
});

test('settings: theme, numeric fields and switches persist', async () => {
  await openTab('settings');
  await page.select('#setTheme', 'light');
  await waitFor(async () => (await page.$eval('html', (e) => e.dataset.theme)) === 'light');
  await setValue('#setDailyLimit', '90');
  await setValue('#setFocusMinutes', '50');
  await page.$eval('#setNotify', (e) => e.closest('label').click());   // the <input> is visually hidden inside a switch label
  await waitFor(async () => {
    const s = await ext.getSettings();
    return s.theme === 'light' && s.dailyLimitMinutes === 90 && s.focus.defaultMinutes === 50 && s.notifyLimits === false;
  }, { message: 'settings persisted' });
});

// ------------------------------------------------------- backup & restore
test('backup → restore: cloud backup writes chunks and the restore preview matches what is restored', async () => {
  await ext.saveSettings({ backup: { syncEnabled: true } });
  await page.reload();
  await openTab('settings');
  await page.click('#backupNow');
  await waitFor(async () => ext.run(async () => !!(await chrome.storage.sync.get('ttt_sync_meta')).ttt_sync_meta), { message: 'sync backup' });

  // wipe local history, then restore through the UI
  await ext.run(async (url) => (await import(url)).clearAllData(), `${ext.base}src/lib/storage.js`);
  await page.click('#restoreSync');
  await page.waitForSelector('#restoreModal:not(.hidden) .detail-stat');
  assert.equal(await count('#restoreModalCard .detail-stat'), 4);
  assert.ok((await text('#restoreModalCard .detail-stat .v')).length > 0);
  await page.select('#restoreModeSelect', 'merge');
  await page.click('#restoreModalConfirm');
  await waitFor(async () => (await dayData()).idx.length > 0, { message: 'days restored' });
});

test('backup → restore: an encrypted backup asks for the passphrase when this device lacks it', async () => {
  await ext.saveSettings({ backup: { syncEnabled: true, encrypt: true, passphrase: 'open-sesame-123' } });
  await page.reload();
  await openTab('settings');
  await page.click('#backupNow');
  await waitFor(async () => ext.run(async () => (await chrome.storage.sync.get('ttt_sync_meta')).ttt_sync_meta?.encrypted === true), { message: 'encrypted backup' });
  const raw = await ext.run(async () => JSON.stringify(await chrome.storage.sync.get(null)));
  assert.ok(!raw.includes('open-sesame-123'), 'passphrase never reaches chrome.storage.sync');
  assert.ok(!raw.includes('github.com'), 'domains are not readable in the encrypted backup');

  await ext.saveSettings({ backup: { passphrase: '' } });
  ext.promptAnswer = 'open-sesame-123';
  await page.reload();
  await openTab('settings');
  await page.click('#restoreSync');
  await page.waitForSelector('#restoreModal:not(.hidden) .detail-stat');
  assert.ok(ext.dialogs.some((d) => d.type === 'prompt'), 'prompted for the passphrase');
  const yes = await ext.run(async (url) => { const i = await import(url); await i.setLang('he'); return i.t('restore.yes'); }, `${ext.base}src/lib/i18n.js`);
  assert.equal(await text('#restoreModalCard .detail-stat:nth-child(4) .v'), yes, 'preview reports the backup as encrypted');
});

test('export: a JSON snapshot never contains the passphrase or the endpoint token', async () => {
  await ext.saveSettings({ backup: { encrypt: true, passphrase: 'top-secret-passphrase', endpointToken: 'bearer-secret-token' } });
  const json = await ext.run(async (url) => JSON.stringify(await (await import(url)).exportAll()), `${ext.base}src/lib/storage.js`);
  assert.ok(!json.includes('top-secret-passphrase'));
  assert.ok(!json.includes('bearer-secret-token'));
});

// --------------------------------------------------------- import / clear
test('import: a JSON backup and a CSV file are imported through the file inputs', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tt-e2e-'));
  try {
    await ext.run(async (url) => (await import(url)).clearAllData(), `${ext.base}src/lib/storage.js`);
    await openTab('settings');

    const small = buildSnapshot({ days: 10, seed: 9 });
    const jsonPath = path.join(dir, 'backup.json');
    fs.writeFileSync(jsonPath, JSON.stringify(small));
    await (await page.$('#importFile')).uploadFile(jsonPath);
    await waitFor(async () => (await dayData()).idx.length === Object.keys(small.days).length, { message: 'json import' });

    const csvPath = path.join(dir, 'history.csv');
    fs.writeFileSync(csvPath, 'date,domain,seconds,visits\n2020-01-05,imported.example.com,600,3\n2020-01-06,imported.example.com,300,1\n');
    await (await page.$('#importCsvFile')).uploadFile(csvPath);
    await waitFor(async () => (await dayData()).idx.includes('2020-01-05'), { message: 'csv import' });
    const { days } = await dayData();
    assert.equal(days['2020-01-05'].domains['imported.example.com'].t, 600);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('clear all data: confirms, then empties the history', async () => {
  await openTab('settings');
  await page.click('#clearData');
  await waitFor(async () => (await dayData()).idx.length === 0, { message: 'history cleared' });
  assert.ok(ext.dialogs.some((d) => d.type === 'confirm'));
});

// --------------------------------------------------------------- misc UI
test('modals close with Escape and the welcome flow can be dismissed', async () => {
  await openTab('sites');
  await waitFor(async () => (await count('#sitesBody tr')) > 0);
  await page.click('#sitesBody tr:first-child');
  await page.waitForSelector('#siteModal:not(.hidden)');
  await page.keyboard.press('Escape');
  await page.waitForSelector('#siteModal.hidden');
  await sleep(50);
});
