// End-to-end checks for what the 1.7 audit and live test found, in the real extension: stored
// strings never become markup, the toggles and the theme setting do what they say, the comparison
// colours mean what they say, the narrow dashboard keeps its tabs in a row, retention and replace
// ask before they delete, and a service-worker restart does not restart the backup alarm.

import { test, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { launch, waitFor } from './harness.mjs';
import { buildSnapshot } from '../tools/fixture.mjs';
import { dayKey, addDays } from '../../extension/src/lib/utils.js';

let ext;
let page;

const text = (sel) => page.$eval(sel, (e) => e.textContent.trim());
async function openDashboard(viewport) {
  page = await ext.openPage('src/dashboard/dashboard.html', viewport ? { viewport } : {});
  await page.waitForSelector('#summaryCards .stat-card');
}
async function openTab(tab) {
  await page.click(`.nav-item[data-tab="${tab}"]`);
  await page.waitForSelector(`#tab-${tab}.active`);
}
const dayData = () => ext.run(async (url) => {
  const s = await import(url);
  const idx = await s.getIndex();
  return { idx, days: await s.getDays(idx) };
}, `${ext.base}src/lib/storage.js`);
const mkDay = (domains) => ({ domains, hours: new Array(24).fill(0) });

before(async () => { ext = await launch(); });
after(async () => { await ext?.close(); });
beforeEach(async () => { await ext.reset(); });
afterEach(async () => {
  assert.deepEqual(ext.errors, [], 'no uncaught errors / console.error during the test');
  try { await page?.close(); } catch { /* the test already closed it */ }
  page = null;
});

// ------------------------------------------------------------------ escaping
test('hostile hostnames already in storage render as plain text in the dashboard, the popup and the site detail', async () => {
  const evil = 'x"><img src=x onerror=window.__pwned=1>.example.com';
  const today = dayKey();
  // written straight to storage: this is what an old install, or a restored backup from before validation, could hold
  await ext.run(async (day, name) => {
    await chrome.storage.local.set({ [`ttt_day_${day}`]: { domains: { [name]: { t: 900, v: 1 }, 'fine.example.com': { t: 300, v: 1 } }, hours: new Array(24).fill(0) }, ttt_index: [day] });
  }, today, evil);

  const injected = () => page.evaluate(() => Boolean(document.querySelector('img[onerror]')) || window.__pwned === 1);

  await openDashboard();
  await page.waitForSelector('#overviewTop .tl-row');
  assert.ok((await text('#overviewTop .tl-name')).includes('<img src=x'), 'the overview shows the hostname as text');
  assert.equal(await injected(), false, 'overview');

  await openTab('sites');
  await page.waitForSelector('#sitesBody tr');
  assert.equal(await injected(), false, 'sites table');
  await page.$$eval('#sitesBody tr', (rows, name) => rows.find((r) => r.dataset.domain === name).click(), evil);
  await page.waitForSelector('#siteModal:not(.hidden) .detail-stats');
  assert.equal(await text('#siteModalCard h3'), evil, 'the site detail title is the literal hostname');
  assert.equal(await injected(), false, 'site detail');
  await page.close();

  page = await ext.openPage('src/popup/popup.html');
  await page.waitForSelector('#topList .top-row');
  assert.equal(await injected(), false, 'popup');
  assert.ok((await text('#topList .name')).length > 0);
});

// ------------------------------------------------------------------ toggles
test('a switch that is ON has its knob at the far end of the track, in both text directions', async () => {
  const knobSide = () => page.$eval('#setEnabled', (input) => {
    const label = input.closest('.switch');
    const track = label.querySelector('.switch-track').getBoundingClientRect();
    const thumb = label.querySelector('.switch-thumb').getBoundingClientRect();
    return thumb.left + thumb.width / 2 > track.left + track.width / 2 ? 'right' : 'left';
  });
  // "on" is the end the knob travels to: the right in left-to-right languages, the left in Hebrew and Arabic
  for (const [lang, on, off] of [['en', 'right', 'left'], ['fr', 'right', 'left'], ['he', 'left', 'right'], ['ar', 'left', 'right']]) {
    await ext.saveSettings({ language: lang, enabled: true });
    await openDashboard();
    await openTab('settings');
    assert.equal(await knobSide(), on, `${lang}: tracking is enabled, so the knob should be at the "on" end`);
    await page.$eval('#setEnabled', (el) => el.closest('label').click());
    await waitFor(async () => (await ext.getSettings()).enabled === false);
    await page.waitForFunction(() => document.querySelector('#setEnabled').checked === false);
    await new Promise((r) => setTimeout(r, 300));             // the knob animates
    assert.equal(await knobSide(), off, `${lang}: switched off, the knob moves to the other end`);
    await page.close();
    page = null;
  }
  await ext.saveSettings({ enabled: true });
});

// ------------------------------------------------------------------ theme
test('the Theme setting reaches the popup and the block page, not just the dashboard', async () => {
  const bg = (p) => p.$eval('body', (b) => getComputedStyle(b).backgroundColor);
  await ext.message('startFocus', { minutes: 25 });          // the block page only stays up during a work phase
  try {
    for (const [theme, popupBg, blockBg] of [['light', 'rgb(244, 244, 248)', 'rgb(243, 244, 249)'], ['dark', 'rgb(15, 15, 23)', 'rgb(12, 12, 20)']]) {
      await ext.saveSettings({ theme });
      const popup = await ext.openPage('src/popup/popup.html');
      await popup.waitForSelector('#todayTotal');
      assert.equal(await bg(popup), popupBg, `popup, theme ${theme}`);
      await popup.close();
      const block = await ext.openPage('src/blocked/blocked.html?d=example.com');
      await block.waitForSelector('#domain');
      assert.equal(await bg(block), blockBg, `block page, theme ${theme}`);
      await block.close();
    }
  } finally {
    await ext.message('stopFocus');
  }
});

// ------------------------------------------------------------------ comparison colours
test('period comparison: less productive time and a lower focus score are bad, less total browsing time is good', async () => {
  const days = {};
  const today = new Date();
  for (let i = 13; i >= 7; i--) days[dayKey(addDays(today, -i))] = mkDay({ 'github.com': { t: 10800, v: 1 } });                         // last week: 3 h a day, all productive
  for (let i = 6; i >= 0; i--) days[dayKey(addDays(today, -i))] = mkDay({ 'github.com': { t: 1800, v: 1 }, 'youtube.com': { t: 1800, v: 1 } });   // this week: 1 h a day, half of it a distraction
  await ext.seed({ app: 'TimeTrack', version: 3, days });
  await openDashboard();
  await page.waitForSelector('#comparePanel .cmp-row .delta');
  const classes = await page.$$eval('#comparePanel .cmp-row .delta', (els) => els.map((e) => e.className.replace('delta', '').trim()));
  assert.deepEqual(classes, ['good', 'bad', 'bad'], 'total time down = good; productive time and focus score down = bad');
});

// ------------------------------------------------------------------ narrow dashboard
test('a narrow dashboard keeps its tabs in one row, with labels until the phone breakpoint', async () => {
  await ext.seed(buildSnapshot({ days: 10, seed: 2 }));
  await openDashboard({ width: 768, height: 900 });
  const measure = () => page.$$eval('.nav-item', (els) => els.map((e) => {
    const r = e.getBoundingClientRect();
    return { top: Math.round(r.top), width: Math.round(r.width), label: getComputedStyle(e.querySelector('span')).display !== 'none' };
  }));
  let items = await measure();
  assert.equal(items.length, 4);
  assert.equal(new Set(items.map((i) => i.top)).size, 1, 'all four tabs sit on one line');
  assert.ok(items.every((i) => i.width > 40 && i.label), 'tabs are wide enough and show their labels at 768 px');
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), 'no horizontal scroll at 768 px');

  await page.setViewport({ width: 480, height: 900 });
  items = await measure();
  assert.equal(new Set(items.map((i) => i.top)).size, 1, 'still one line at 480 px');
  assert.ok(items.every((i) => !i.label), 'labels are hidden on a phone');
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), 'no horizontal scroll at 480 px');
});

// ------------------------------------------------------------------ retention
test('lowering retention says how many days it will delete before deleting; 0 keeps everything', async () => {
  const today = new Date();
  const days = {
    [dayKey(addDays(today, -1))]: mkDay({ 'a.example.com': { t: 60, v: 1 } }),
    [dayKey(addDays(today, -100))]: mkDay({ 'a.example.com': { t: 60, v: 1 } }),
    [dayKey(addDays(today, -200))]: mkDay({ 'a.example.com': { t: 60, v: 1 } }),
  };
  await ext.seed({ app: 'TimeTrack', version: 3, days });
  await ext.saveSettings({ language: 'en', retentionDays: 365 });
  await openDashboard();
  await openTab('settings');

  await page.$eval('#setRetention', (el) => { el.value = '30'; el.dispatchEvent(new Event('change', { bubbles: true })); });
  await waitFor(async () => (await dayData()).idx.length === 1, { message: 'the two old days are deleted after confirming' });
  const confirm = ext.dialogs.find((d) => d.type === 'confirm');
  assert.ok(confirm, 'a confirmation was shown');
  assert.match(confirm.message, /30/);
  assert.match(confirm.message, /\b2\b/, 'it says how many days would go');

  const dialogsBefore = ext.dialogs.length;
  await page.$eval('#setRetention', (el) => { el.value = '0'; el.dispatchEvent(new Event('change', { bubbles: true })); });
  await waitFor(async () => (await ext.getSettings()).retentionDays === 0);
  assert.equal(ext.dialogs.length, dialogsBefore, 'keeping everything deletes nothing, so it asks nothing');
  assert.equal((await dayData()).idx.length, 1);
});

// ------------------------------------------------------------------ replace + undo
test('a replace import can be undone from Settings, and the undo can itself be undone', async () => {
  const original = buildSnapshot({ days: 20, seed: 4 });
  await ext.seed(original);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tt-e2e-'));
  try {
    const other = buildSnapshot({ days: 5, seed: 8 });
    const file = path.join(dir, 'other.json');
    fs.writeFileSync(file, JSON.stringify(other));
    await openDashboard();
    await openTab('settings');
    assert.equal(await page.$eval('#undoReplaceBlock', (e) => e.classList.contains('hidden')), true, 'nothing to undo yet');

    await page.$eval('#importMode', (el) => { el.value = 'replace'; });
    await (await page.$('#importFile')).uploadFile(file);
    await waitFor(async () => (await dayData()).idx.length === 5, { message: 'replace import' });
    await page.waitForSelector('#undoReplaceBlock:not(.hidden)');
    assert.match(await text('#undoReplaceInfo'), /20/, 'the row says how many days it would put back');

    await page.click('#undoReplaceBtn');
    await waitFor(async () => (await dayData()).idx.length === 20, { message: 'undo restores the 20 days' });
    assert.deepEqual((await dayData()).idx, Object.keys(original.days).sort());
    await page.waitForSelector('#undoReplaceBlock:not(.hidden)');
    assert.match(await text('#undoReplaceInfo'), /\b5\b/, 'and the 5 days are now the undo copy');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('importing a file that is not a backup is refused clearly and changes nothing', async () => {
  await ext.seed(buildSnapshot({ days: 6, seed: 5 }));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tt-e2e-'));
  try {
    const file = path.join(dir, 'not-a-backup.json');
    fs.writeFileSync(file, JSON.stringify({ hello: 'world', days: 'nope' }));
    await ext.saveSettings({ language: 'en' });
    await openDashboard();
    await openTab('settings');
    await page.$eval('#importMode', (el) => { el.value = 'replace'; });
    await (await page.$('#importFile')).uploadFile(file);
    await page.waitForSelector('#toast.show.error');
    assert.match(await text('#toast'), /not a TimeTrack backup/i);
    assert.equal((await dayData()).idx.length, 6, 'the existing history is untouched');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ------------------------------------------------------------------ worker restarts (keep this one last: it drops the harness's debugger on the worker)
test('a service-worker restart does not restart the 60-minute backup alarm', async () => {
  const alarms = () => ext.run(async () => Object.fromEntries((await chrome.alarms.getAll()).map((a) => [a.name, a.scheduledTime])));
  const before = await alarms();
  assert.ok(before.ttt_backup, 'the backup alarm exists');
  assert.ok(before.ttt_backup - Date.now() > 30 * 60 * 1000, 'and is about an hour away');

  assert.equal(await ext.restartWorker(), true, 'the worker really stopped');
  await new Promise((r) => setTimeout(r, 1500));            // let the restarted worker run its init()
  const after = await alarms();
  assert.equal(after.ttt_backup, before.ttt_backup, 'its countdown was not restarted by the new worker');
});
