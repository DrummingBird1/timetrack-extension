// Automated accessibility scan (axe-core) of every screen, in light and dark themes and
// in an RTL language, plus keyboard-operation checks. Violations fail the build.

import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { launch } from './harness.mjs';
import { buildSnapshot } from '../tools/fixture.mjs';

const axeSource = fs.readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');

let ext;
before(async () => { ext = await launch(); });
after(async () => { await ext?.close(); });
beforeEach(async () => {
  await ext.reset();
  await ext.seed(buildSnapshot({ days: 90, seed: 5 }));
});

/** Run axe on the current page. CDP evaluation is not subject to the extension-page CSP. */
async function scan(page) {
  await page.evaluate(axeSource);
  const result = await page.evaluate(() => axe.run(document, { resultTypes: ['violations'] }));
  return result.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical' || v.impact === 'moderate')
    .map((v) => `${v.impact} · ${v.id}: ${v.help}\n      ${v.nodes.slice(0, 4).map((n) => n.target.join(' ')).join('\n      ')}`);
}

const SCREENS = [['overview'], ['sites'], ['insights'], ['settings']];

for (const theme of ['dark', 'light']) {
  for (const [tab] of SCREENS) {
    test(`dashboard › ${tab} (${theme}) has no accessibility violations`, async () => {
      await ext.saveSettings({ theme, language: 'en' });
      const page = await ext.openPage('src/dashboard/dashboard.html');
      await page.waitForSelector('#summaryCards .stat-card');
      await page.click(`.nav-item[data-tab="${tab}"]`);
      await page.waitForSelector(`#tab-${tab}.active`);
      await new Promise((r) => setTimeout(r, 400));                 // charts + async panels
      const violations = await scan(page);
      await page.close();
      assert.deepEqual(violations, [], `\n${violations.join('\n')}`);
    });
  }
}

test('dashboard in an RTL language (Arabic) has no accessibility violations', async () => {
  await ext.saveSettings({ theme: 'dark', language: 'ar' });
  const page = await ext.openPage('src/dashboard/dashboard.html');
  await page.waitForSelector('#summaryCards .stat-card');
  const violations = await scan(page);
  await page.close();
  assert.deepEqual(violations, [], `\n${violations.join('\n')}`);
});

test('popup has no accessibility violations', async () => {
  await ext.saveSettings({ language: 'en' });
  const page = await ext.openPage('src/popup/popup.html', { viewport: { width: 380, height: 640 } });
  await page.waitForSelector('#todayTotal');
  const violations = await scan(page);
  await page.close();
  assert.deepEqual(violations, [], `\n${violations.join('\n')}`);
});

// ---------------------------------------------------------------- keyboard + ARIA behaviour
async function dashboard() {
  await ext.saveSettings({ language: 'en', theme: 'dark' });
  const page = await ext.openPage('src/dashboard/dashboard.html');
  await page.waitForSelector('#summaryCards .stat-card');
  return page;
}

test('tabs: roles and aria-selected follow the active tab, and arrow keys move between tabs', async () => {
  const page = await dashboard();
  const state = () => page.$$eval('.nav-item', (b) => b.map((x) => `${x.dataset.tab}:${x.getAttribute('role')}:${x.getAttribute('aria-selected')}:${x.tabIndex}`));
  assert.deepEqual(await state(), ['overview:tab:true:0', 'sites:tab:false:-1', 'insights:tab:false:-1', 'settings:tab:false:-1']);

  await page.focus('.nav-item[data-tab="overview"]');
  await page.keyboard.press('ArrowDown');
  await page.waitForSelector('#tab-sites.active');
  assert.equal(await page.evaluate(() => document.activeElement.dataset.tab), 'sites', 'focus moved with the selection');
  await page.keyboard.press('End');
  await page.waitForSelector('#tab-settings.active');
  await page.keyboard.press('ArrowDown');                             // wraps around
  await page.waitForSelector('#tab-overview.active');
  assert.deepEqual(await state(), ['overview:tab:true:0', 'sites:tab:false:-1', 'insights:tab:false:-1', 'settings:tab:false:-1']);
  assert.ok(await page.$eval('#toast', (e) => e.getAttribute('role') === 'status'), 'toasts are announced');
  await page.close();
});

test('site rows are keyboard-operable; the dialog traps focus, closes on Escape and returns focus', async () => {
  const page = await dashboard();
  await page.click('.nav-item[data-tab="sites"]');
  await page.waitForSelector('#sitesBody tr');
  const domain = await page.$eval('#sitesBody tr', (r) => r.dataset.domain);

  await page.focus('#sitesBody tr');
  await page.keyboard.press('Enter');
  await page.waitForSelector('#siteModal:not(.hidden) .modal-card');
  assert.equal(await page.$eval('#siteModal', (m) => m.getAttribute('aria-label')), domain, 'the dialog is named after the site');
  assert.ok(await page.evaluate(() => document.querySelector('#siteModal').contains(document.activeElement)), 'focus moved into the dialog');

  for (let i = 0; i < 25; i++) {                                      // more Tab presses than there are controls
    await page.keyboard.press('Tab');
    assert.ok(await page.evaluate(() => document.querySelector('#siteModal').contains(document.activeElement)), `focus escaped the dialog after ${i + 1} Tabs`);
  }
  await page.keyboard.down('Shift'); await page.keyboard.press('Tab'); await page.keyboard.up('Shift');
  assert.ok(await page.evaluate(() => document.querySelector('#siteModal').contains(document.activeElement)), 'Shift+Tab stays inside too');

  await page.keyboard.press('Escape');
  await page.waitForSelector('#siteModal.hidden');
  assert.equal(await page.evaluate(() => document.activeElement.dataset.domain), domain, 'focus returned to the row that opened it');
  await page.close();
});

test('chip remove buttons are real, named, keyboard-operable buttons', async () => {
  const page = await dashboard();
  await page.click('.nav-item[data-tab="settings"]');
  await page.type('#blacklistDomain', 'keyboard.example.com');
  await page.keyboard.press('Enter');
  await page.waitForSelector('#blacklistList .cat-chip .x');
  const info = await page.$eval('#blacklistList .cat-chip .x', (x) => ({ role: x.getAttribute('role'), label: x.getAttribute('aria-label'), tab: x.tabIndex }));
  assert.deepEqual({ role: info.role, tab: info.tab }, { role: 'button', tab: 0 });
  assert.ok(info.label && info.label !== 'btn.remove', `aria-label is "${info.label}"`);
  await page.focus('#blacklistList .cat-chip .x');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.querySelectorAll('#blacklistList .cat-chip').length === 0);
  assert.equal((await ext.getSettings()).blacklist.length, 0);
  await page.close();
});
