// How does the extension behave with years of history? Seeds ~3 years of synthetic
// browsing (see tools/fixture.mjs) and times the operations a user actually waits
// on. Thresholds are deliberately generous — they catch pathological regressions,
// while the printed numbers are what to compare when deciding on optimisations
// (e.g. whether pre-aggregated rollups are worth their complexity).

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launch, waitFor } from './harness.mjs';
import { buildSnapshot, describe } from '../tools/fixture.mjs';

let ext;
let snapshot;
before(async () => {
  ext = await launch();
  snapshot = buildSnapshot({ days: 1095, seed: 7 });
});
after(async () => { await ext?.close(); });

const ms = (n) => `${Math.round(n)}ms`;

test('3 years of history: storage, dashboard and backup stay responsive', async (t) => {
  const info = describe(snapshot);
  t.diagnostic(`fixture: ${info.days} days, ${info.domainDays} domain-day records, ${(info.bytes / 1024).toFixed(0)} KB JSON`);

  // --- import through the extension's own code path
  let t0 = Date.now();
  await ext.seed(snapshot);
  const importMs = Date.now() - t0;

  // --- raw read of the whole history (what 'All' and the all-history Sites toggle do)
  const readMs = await ext.run(async (url) => {
    const s = await import(url);
    const t = performance.now();
    const idx = await s.getIndex();
    await s.getDays(idx);
    return performance.now() - t;
  }, `${ext.base}src/lib/storage.js`);

  const bytes = await ext.run(async () => chrome.storage.local.getBytesInUse(null));

  // --- dashboard: initial paint on the default 7-day range, then the 'All' range
  const page = await ext.openPage('src/dashboard/dashboard.html');
  await page.waitForSelector('#summaryCards .stat-card');

  const html7 = await page.$eval('#summaryCards', (e) => e.innerHTML);
  t0 = Date.now();
  await page.click('#rangePicker [data-range="all"]');
  await waitFor(async () => (await page.$eval('#summaryCards', (e) => e.innerHTML)) !== html7, { timeout: 30000, message: "the 'All' range to render" });
  await page.waitForSelector('#trendChart svg');
  const allRangeMs = Date.now() - t0;

  await page.click('.nav-item[data-tab="sites"]');
  await page.waitForSelector('#tab-sites.active');
  t0 = Date.now();
  await page.click('#siteAllHistory');
  await waitFor(async () => (await page.$$eval('#sitesBody tr', (r) => r.length)) > 20, { timeout: 30000, message: 'all-history sites table' });
  const sitesAllMs = Date.now() - t0;

  await page.click('.nav-item[data-tab="insights"]');
  t0 = Date.now();
  await page.waitForSelector('#tab-insights.active #heatmap svg');
  const insightsMs = Date.now() - t0;

  // --- cloud backup of the full history (trim + chunk + write)
  await ext.saveSettings({ backup: { syncEnabled: true } });
  t0 = Date.now();
  const backup = await ext.message('runBackup');
  const backupMs = Date.now() - t0;

  t.diagnostic([
    `import ${ms(importMs)}`,
    `read-all ${ms(readMs)}`,
    `'All' range paint ${ms(allRangeMs)}`,
    `sites all-history ${ms(sitesAllMs)}`,
    `insights ${ms(insightsMs)}`,
    `cloud backup ${ms(backupMs)} (${backup.status})`,
    `storage ${(bytes / 1024).toFixed(0)} KB`,
  ].join(' · '));

  assert.equal(backup.ok, true, `cloud backup should succeed with 3 years of data: ${backup.status}`);
  assert.ok(allRangeMs < 8000, `'All' range took ${ms(allRangeMs)}`);
  assert.ok(sitesAllMs < 8000, `all-history Sites took ${ms(sitesAllMs)}`);
  assert.ok(readMs < 5000, `reading the full history took ${ms(readMs)}`);
  assert.ok(backupMs < 20000, `cloud backup took ${ms(backupMs)}`);
  assert.deepEqual(ext.errors, []);
  await page.close();
});
