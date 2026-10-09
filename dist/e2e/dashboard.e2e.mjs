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

// Capture what the page hands to the download link instead of writing files to disk.
async function captureExports() {
  const cdp = await ext.browser.target().createCDPSession();
  await cdp.send('Browser.setDownloadBehavior', { behavior: 'deny' }).catch(() => {});
  await page.evaluate(() => {
    window.__exports = [];
    const original = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (blob) => { window.__exports.push(blob); return original(blob); };
  });
  return {
    async last() {
      await page.waitForFunction((n) => window.__exports.length > n, {}, 0);
      return page.evaluate(async () => {
        const blob = window.__exports[window.__exports.length - 1];
        return { type: blob.type, text: await blob.text() };
      });
    },
  };
}

test('export: JSON, CSV and current-view CSV downloads have the right content (and no secrets)', async () => {
  await ext.saveSettings({ backup: { encrypt: true, passphrase: 'never-export-me' } });
  await openTab('settings');
  const cap = await captureExports();

  await page.click('#exportJson');
  const json = await cap.last();
  const snap = JSON.parse(json.text);
  assert.equal(snap.app, 'TimeTrack');
  assert.equal(Object.keys(snap.days).length, Object.keys(snapshot.days).length);
  assert.ok(!json.text.includes('never-export-me'), 'passphrase must not be in the export');

  await page.evaluate(() => { window.__exports.length = 0; });
  await page.click('#exportCsv');
  const csv = await cap.last();
  const lines = csv.text.replace(/^﻿/, '').trim().split('\n');
  assert.equal(lines[0], '"date","domain","category","seconds","minutes","visits"');
  const domainDays = Object.values(snapshot.days).reduce((n, d) => n + Object.keys(d.domains).length, 0);
  assert.equal(lines.length - 1, domainDays, 'one CSV row per domain-day');

  await page.evaluate(() => { window.__exports.length = 0; });
  await page.click('#exportView');                                  // current 7-day view only
  const view = await cap.last();
  const viewRows = view.text.trim().split('\n').length - 1;
  assert.ok(viewRows > 0 && viewRows < domainDays, `view export has ${viewRows} rows (< ${domainDays})`);
});

// ------------------------------------------------------------ session log
test('session log: opt-in toggle, per-site visit-length stats and deletion', async () => {
  const top = ranked(snapshot)[0].dom;
  const day = Object.keys(snapshot.days).sort().slice(-1)[0];

  // off by default, and the site detail says how to turn it on
  assert.equal((await ext.getSettings()).sessionLog, false);
  await openTab('sites');
  await waitFor(async () => (await count('#sitesBody tr')) > 0);
  const openTop = () => page.$$eval('#sitesBody tr', (rows, t) => rows.find((r) => r.querySelector('.dom').textContent === t).click(), top);
  await openTop();
  await page.waitForSelector('#detailSessions .set-desc');
  await page.keyboard.press('Escape');

  // turn it on from Settings
  await openTab('settings');
  await page.$eval('#setSessionLog', (e) => e.closest('label').click());
  await waitFor(async () => (await ext.getSettings()).sessionLog === true, { message: 'session log enabled' });

  // visits recorded by the engine would look like this
  await ext.run(async (url, d, dom) => {
    const s = await import(url);
    await s.recordSession({ dateKey: d, domain: dom, startSec: 3600, seconds: 30 });
    await s.recordSession({ dateKey: d, domain: 'other.example.com', startSec: 3700, seconds: 10 });
    await s.recordSession({ dateKey: d, domain: dom, startSec: 4000, seconds: 600 });
    await s.recordSession({ dateKey: d, domain: 'other.example.com', startSec: 5000, seconds: 10 });
    await s.recordSession({ dateKey: d, domain: dom, startSec: 7000, seconds: 4000 });
  }, `${ext.base}src/lib/storage.js`, day, top);

  await openTab('sites');
  await openTop();
  await page.waitForSelector('#detailSessionChart svg');
  const stats = await page.$$eval('#detailSessions .detail-stat .v', (els) => els.map((e) => e.textContent.trim()));
  assert.equal(stats[0], '3', 'three recorded visits to this site');
  assert.equal(await page.$$eval('#detailSessionChart svg rect', (r) => r.length) > 0, true);
  await page.keyboard.press('Escape');

  // delete the log: the tracked time stays
  const before = (await dayData()).idx.length;
  await openTab('settings');
  await page.click('#clearSessions');
  await waitFor(async () => (await ext.run(async (url, k) => Object.keys(await (await import(url)).getSessions([k])).length, `${ext.base}src/lib/storage.js`, day)) === 0, { message: 'sessions deleted' });
  assert.equal((await dayData()).idx.length, before, 'tracked days are untouched');
  assert.ok(ext.dialogs.some((d) => d.type === 'confirm'));
});

// ----------------------------------------------- v2 analytics: budgets, trend, streak, compare
test('category budgets: add in Settings, progress shows on Overview, remove hides it', async () => {
  await openTab('settings');
  assert.ok(await page.$('#budgetList'), 'budget editor present');
  await page.select('#budgetCat', 'entertainment');
  await page.type('#budgetMinutes', '90');
  await page.click('#budgetAdd');
  await waitFor(async () => (await ext.getSettings()).categoryBudgets.entertainment === 90, { message: 'budget saved' });
  assert.equal(await count('#budgetList .cat-chip'), 1);

  await openTab('overview');
  await page.waitForSelector('#budgetWrap:not(.hidden) .cb-row');
  assert.equal(await count('#budgetPanel .cb-row'), 1);
  assert.match(await text('#budgetPanel .cb-time'), /\d+%/);

  await openTab('settings');
  await page.click('#budgetList .cat-chip .x');
  await waitFor(async () => !('entertainment' in (await ext.getSettings()).categoryBudgets), { message: 'budget removed from storage' });
  await openTab('overview');
  await page.waitForSelector('#budgetWrap.hidden');
});

test('category budgets: a non-positive amount is rejected', async () => {
  await openTab('settings');
  await page.type('#budgetMinutes', '0');
  await page.click('#budgetAdd');
  assert.match(await toastText(), /./);
  assert.deepEqual((await ext.getSettings()).categoryBudgets, {});
});

test('insights: the weekly focus-score trend shows the last 12 weeks and the best week', async () => {
  await openTab('insights');
  await page.waitForSelector('#focusTrendChart svg');
  assert.ok((await count('#focusTrendChart svg rect')) >= 10, 'about 12 bars');
  assert.match(await text('#focusTrendHint'), /\d+/);
});

test('overview: a goal streak card appears only when a daily goal is set', async () => {
  assert.equal(await count('#summaryCards .stat-card'), 6, 'no goal → six cards');
  await ext.saveSettings({ dailyGoalMinutes: 1 });          // 1 productive minute: met on nearly every seeded day
  await page.reload();
  await page.waitForSelector('#summaryCards .stat-card');
  await waitFor(async () => (await count('#summaryCards .stat-card')) === 7, { message: 'seventh card' });
  assert.match(await text('#summaryCards .stat-card:nth-child(7) .val'), /^\d+/);
});

test('overview: any two date ranges can be compared, with the biggest per-site changes', async () => {
  const days = Object.keys(snapshot.days).sort();
  const set = (sel, v) => page.$eval(sel, (e, val) => { e.value = val; }, v);
  await set('#cmpFromA', days[days.length - 20]);
  await set('#cmpToA', days[days.length - 11]);
  await set('#cmpFromB', days[days.length - 10]);
  await set('#cmpToB', days[days.length - 1]);
  await page.click('#cmpRun');
  await page.waitForSelector('#customCompareResult .cmp-row');
  assert.equal(await count('#customCompareResult .cmp-row'), 3);
  assert.ok((await count('#customCompareResult .tl-row')) > 0, 'per-site changes listed');

  await set('#cmpFromA', days[days.length - 1]);            // start after end → rejected
  await set('#cmpToA', days[days.length - 5]);
  await page.click('#cmpRun');
  assert.match(await toastText(), /./);
});

// -------------------------------------------------------- v2 focus: strict, schedule, history
test('settings: strict mode toggle and scheduled focus sessions', async () => {
  await openTab('settings');
  await page.$eval('#setFocusStrict', (e) => e.closest('label').click());
  await waitFor(async () => (await ext.getSettings()).focus.strict === true, { message: 'strict saved' });

  // needs a day and a time
  await page.click('#scheduleAdd');
  assert.match(await toastText(), /./);
  assert.deepEqual((await ext.getSettings()).focus.schedule, []);

  await page.$$eval('#scheduleDays .chip-check input', (inputs) => { inputs[1].click(); inputs[3].click(); });
  await page.$eval('#scheduleTime', (e) => { e.value = '08:30'; });
  await page.type('#scheduleMinutes', '45');
  await page.click('#scheduleAdd');
  await waitFor(async () => (await ext.getSettings()).focus.schedule.length === 1, { message: 'schedule saved' });
  const [slot] = (await ext.getSettings()).focus.schedule;
  assert.deepEqual(slot, { days: [1, 3], time: '08:30', minutes: 45 });
  assert.equal(await count('#scheduleList .cat-chip'), 1);

  await page.click('#scheduleList .cat-chip .x');
  await waitFor(async () => (await ext.getSettings()).focus.schedule.length === 0, { message: 'schedule removed' });
});

test('insights: focus-session history shows totals and the latest sessions', async () => {
  await openTab('insights');
  await page.waitForSelector('#focusLogBody .empty');           // nothing yet
  const now = Date.now();
  await ext.run(async (url, base) => {
    const s = await import(url);
    await s.addFocusLog({ start: base - 86400000, end: base - 86400000 + 1500000, cycles: 1, completedCycles: 1, workedMs: 1500000, endedEarly: false });
    await s.addFocusLog({ start: base - 3600000, end: base - 3000000, cycles: 2, completedCycles: 1, workedMs: 900000, endedEarly: true });
  }, `${ext.base}src/lib/storage.js`, now);
  await page.reload();
  await openTab('insights');
  await page.waitForSelector('#focusLogBody .detail-stats');
  const stats = await page.$$eval('#focusLogBody .detail-stat .v', (els) => els.map((e) => e.textContent.trim()));
  assert.equal(stats[0], '2', 'two sessions');
  assert.equal(stats[2], '50%', 'one of two completed');
  assert.equal(await count('#focusLogBody .tl-row'), 2);
});

// ---------------------------------------------------- sites at scale + bulk actions
async function seedManySites(n = 3000) {
  const d = new Date();
  const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const domains = {};
  for (let i = 0; i < n; i++) domains[`bulk-site-${i}.example.com`] = { t: 60 + (i % 50), v: 1 };
  await ext.seed({ app: 'TimeTrack', version: 3, days: { [key]: { domains, hours: new Array(24).fill(0) } } }, 'merge');
}

test('sites at scale: thousands of domains render in chunks and load more on scroll', async (t) => {
  await seedManySites();
  await page.reload();
  await page.waitForSelector('#summaryCards .stat-card');
  const started = Date.now();
  await openTab('sites');
  await waitFor(async () => (await count('#sitesBody tr')) > 0, { message: 'first rows' });
  t.diagnostic(`first paint of the Sites tab with ~3000 domains: ${Date.now() - started}ms`);
  const first = await count('#sitesBody tr');
  assert.ok(first <= 150, `only the first chunk is in the DOM, got ${first}`);
  assert.match(await text('#sitesFooter'), /3\d{3}/);

  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await waitFor(async () => (await count('#sitesBody tr')) > first, { message: 'next chunk on scroll' });
});

test('bulk actions: select everything that matches the search (not just the rendered rows) and apply', async () => {
  await seedManySites();
  await page.reload();
  await page.waitForSelector('#summaryCards .stat-card');
  await openTab('sites');
  await waitFor(async () => (await count('#sitesBody tr')) > 0);

  // "bulk-site-12" matches 12, 120-129 and 1200-1299 → 1 + 10 + 100 = 111 sites, more than one chunk
  await page.type('#siteSearch', 'bulk-site-12');
  await waitFor(async () => (await text('#sitesFooter')).includes('111') || (await count('#sitesBody tr')) === 111, { message: 'filtered list' });
  await page.click('#selectAllSites');
  await page.waitForSelector('#bulkBar:not(.hidden)');
  assert.match(await text('#bulkCount'), /111/);

  await page.select('#bulkCategory', 'news');
  await waitFor(async () => Object.keys((await ext.getSettings()).categoryMap).length === 111, { message: '111 categories saved in one go' });
  const map = (await ext.getSettings()).categoryMap;
  assert.ok(Object.values(map).every((c) => c === 'news'));
  await page.waitForSelector('#bulkBar.hidden');                   // selection is cleared after applying

  // pick two rows by hand: limit + untrack + pin
  const boxes = await page.$$('#sitesBody .row-select');
  await boxes[0].click();
  await boxes[1].click();
  assert.match(await text('#bulkCount'), /2/);
  const domains = await page.$$eval('#sitesBody tr', (rows) => rows.slice(0, 2).map((r) => r.dataset.domain));
  await page.type('#bulkLimit', '25');
  await page.click('#bulkSetLimit');
  await waitFor(async () => Object.keys((await ext.getSettings()).siteLimits).length === 2, { message: 'limits saved' });
  assert.deepEqual(Object.keys((await ext.getSettings()).siteLimits).sort(), [...domains].sort());

  const again = await page.$$('#sitesBody .row-select');
  await again[0].click();
  await page.click('#bulkUntrack');
  await waitFor(async () => (await ext.getSettings()).blacklist.length === 1, { message: 'one site no longer tracked' });
});

// -------------------------------------------------------------------- onboarding
test('onboarding: demo data loads from the welcome screen and is removed from the banner', async () => {
  await page.close();
  await ext.reset();                                                   // a brand-new, empty profile
  page = await ext.openPage('src/dashboard/dashboard.html#welcome');
  await page.waitForSelector('#welcomeModal:not(.hidden)');
  await page.click('#welcomeDemo');
  await page.waitForSelector('#demoBanner:not(.hidden)');
  await page.waitForSelector('#welcomeModal.hidden');
  await waitFor(async () => (await dayData()).idx.length === 28, { message: '28 demo days' });
  await waitFor(async () => (await count('#overviewTop .tl-row')) > 0, { message: 'overview shows the demo' });

  await ext.run(async (url) => (await import(url)).addTime({ dateKey: '2099-01-01', domain: 'real.example.com', seconds: 60, hour: 9 }), `${ext.base}src/lib/storage.js`);
  await page.click('#demoRemove');
  await page.waitForSelector('#demoBanner.hidden');
  assert.deepEqual((await dayData()).idx, ['2099-01-01'], 'only the demo days are removed');
});

test('onboarding: demo data refuses to mix with existing history', async () => {
  await page.goto(`${ext.base}src/dashboard/dashboard.html#welcome`);
  await page.reload();
  await page.waitForSelector('#welcomeModal:not(.hidden)');
  const before = (await dayData()).idx.length;
  await page.click('#welcomeDemo');
  await page.waitForSelector('#toast.show.error');
  assert.equal((await dayData()).idx.length, before);
  assert.ok(await page.$('#demoBanner.hidden'));
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

test('import: a RescueTime-style CSV is imported with its hourly detail, and an unrecognized CSV is rejected clearly', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tt-e2e-'));
  try {
    await ext.run(async (url) => (await import(url)).clearAllData(), `${ext.base}src/lib/storage.js`);
    await openTab('settings');

    const good = path.join(dir, 'rescuetime.csv');
    fs.writeFileSync(good, [
      'Date,Time Spent (seconds),Number of People,Activity,Category,Productivity',
      '2026-03-02T09:00:00,600,1,github.com,Software Development,2',
      '2026-03-02T09:00:00,120,1,Slack,General Communication,1',
      '2026-03-02T10:00:00,300,1,github.com,Software Development,2',
    ].join('\n'));
    await (await page.$('#importCsvFile')).uploadFile(good);
    await waitFor(async () => (await dayData()).idx.includes('2026-03-02'), { message: 'rescuetime import' });
    const day = (await dayData()).days['2026-03-02'];
    assert.equal(day.domains['github.com'].t, 900);
    assert.deepEqual(day.domains['github.com'].dh, { 9: 600, 10: 300 });
    assert.ok(!('Slack' in day.domains) && !('slack' in day.domains), 'app rows are not websites');

    const bad = path.join(dir, 'bad.csv');
    fs.writeFileSync(bad, 'foo,bar\n1,2\n');
    await (await page.$('#importCsvFile')).uploadFile(bad);
    await page.waitForSelector('#toast.show.error');
    assert.equal((await dayData()).idx.length, 1, 'a rejected file changes nothing');
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
