import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { launch, EXT_PATH } from './harness.mjs';

let ext;
before(async () => { ext = await launch(); });
after(async () => { await ext?.close(); });
beforeEach(async () => { await ext.reset(); });

test('the extension loads and its service worker answers messages', async () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(EXT_PATH, 'manifest.json'), 'utf8'));
  const live = await ext.message('getLive');
  assert.equal(typeof live.enabled, 'boolean');
  assert.ok(live.today && Array.isArray(live.today.hours), 'getLive returns today\'s record');
  assert.equal(await ext.run(() => chrome.runtime.getManifest().version), manifest.version);
});

test('the manifest name, description and shortcut labels follow the browser language through _locales', async () => {
  // One browser per language: Chrome picks the _locales folder from its own UI language.
  for (const lang of ['he', 'en', 'ar', 'ru', 'es', 'fr']) {
    const probe = await launch({ lang });
    try {
      const table = JSON.parse(fs.readFileSync(path.join(EXT_PATH, '_locales', lang, 'messages.json'), 'utf8'));
      const running = await probe.run(() => {
        const m = chrome.runtime.getManifest();
        return { name: m.name, description: m.description, commands: Object.values(m.commands).map((c) => c.description) };
      });
      assert.equal(running.name, table.appName.message, `${lang}: name`);
      assert.equal(running.description, table.appDescription.message, `${lang}: description`);
      // Chrome returns the commands in its own order, so compare as sets.
      assert.deepEqual([...running.commands].sort(), [table.cmdToggleTracking.message, table.cmdStartFocus.message, table.cmdOpenDashboard.message].sort(), `${lang}: shortcut labels`);
    } finally {
      await probe.close();
    }
  }
});

test('popup renders on an empty profile without errors', async () => {
  const popup = await ext.openPage('src/popup/popup.html');
  await popup.waitForSelector('#todayTotal');
  assert.ok((await popup.$eval('#todayTotal', (e) => e.textContent)).length > 0);
  assert.ok(await popup.$('#weekChart svg'), 'weekly chart rendered');
  assert.deepEqual(ext.errors, []);
  await popup.close();
});

test('popup top-site bars are visible when there is data', async () => {
  const { buildSnapshot } = await import('../tools/fixture.mjs');
  await ext.seed(buildSnapshot({ days: 3, seed: 2 }));
  const popup = await ext.openPage('src/popup/popup.html');
  await popup.waitForSelector('#topList .top-row');
  const fills = await popup.$$eval('#topList .bar-fill', (els) => els.map((e) => e.getBoundingClientRect().width));
  assert.ok(fills.length > 0 && fills.every((w) => w > 2), `bars must have width, got ${fills}`);
  await popup.close();
});

test('every dashboard tab renders on an empty profile without errors', async () => {
  const page = await ext.openPage('src/dashboard/dashboard.html');
  for (const tab of ['overview', 'sites', 'insights', 'settings']) {
    await page.click(`.nav-item[data-tab="${tab}"]`);
    assert.ok(await page.$eval(`#tab-${tab}`, (e) => e.classList.contains('active')), `${tab} tab is active`);
  }
  assert.deepEqual(ext.errors, []);
  await page.close();
});
