// Captures the Chrome Web Store screenshots (1280x800 JPEG) from the REAL extension UI, in
// each UI language, populated with deterministic synthetic browsing data.
//
//   node tools/screenshots.mjs                 # he + en  -> store-assets/screenshots/<lang>/
//   node tools/screenshots.mjs --langs all     # all six languages
//   node tools/screenshots.mjs --langs fr,es
//
// Needs the E2E setup (pnpm install; pnpm exec puppeteer browsers install chrome).
// Only he/en are committed (the default listing locales); the rest are git-ignored.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch } from '../e2e/harness.mjs';
import { buildSnapshot } from './fixture.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const outRoot = path.join(root, 'store-assets/screenshots');
const ALL = ['he', 'en', 'ar', 'ru', 'es', 'fr'];
const langArg = process.argv.indexOf('--langs');
const langs = langArg < 0 ? ['he', 'en'] : process.argv[langArg + 1] === 'all' ? ALL : process.argv[langArg + 1].split(',');

const SIZE = { width: 1280, height: 800 };
const JPEG = { type: 'jpeg', quality: 88 };
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
// Dashboard shots lay out at 1600x1000 and render at 0.8x, so a 1280x800 frame holds the charts below the cards
// (a real device scale factor, unlike CSS zoom, keeps vh-based layout such as the sidebar correct).
const DASHBOARD = { width: 1600, height: 1000, deviceScaleFactor: 0.8 };

const ext = await launch();
try {
  for (const lang of langs) {
    const dir = path.join(outRoot, lang);
    fs.mkdirSync(dir, { recursive: true });
    const shot = async (page, name) => { await page.screenshot({ path: path.join(dir, name), ...JPEG }); console.log(`  ${lang}/${name}`); };

    await ext.reset();
    const snapshot = buildSnapshot({ days: 90, seed: 21 });
    await ext.seed(snapshot);
    await ext.saveSettings({
      language: lang, theme: 'dark', dailyGoalMinutes: 75, sessionLog: true,
      focus: { defaultMinutes: 25, mode: 'block', blockDomains: ['youtube.com'] },
    });
    // Richer panels: a budget, some visits for the top site, and a few finished focus sessions.
    const recent = Object.keys(snapshot.days).sort().slice(-7);               // what the 7-day views show
    const perSite = {};
    for (const day of recent) for (const [dom, r] of Object.entries(snapshot.days[day].domains)) perSite[dom] = (perSite[dom] || 0) + r.t;
    const topSite = Object.entries(perSite).sort((a, b) => b[1] - a[1])[0][0];
    const visitDays = recent.map((day) => [day, snapshot.days[day].domains[topSite]?.t || 0]).filter(([, t]) => t > 0);
    await ext.run(async (url, topSite, visitDays) => {
      const s = await import(url);
      await s.setSettingsMapEntry('categoryBudgets', 'entertainment', 420);
      // Visits that add up exactly to each day's tracked time for the site, so every panel agrees with the others.
      const shares = [0.34, 0.22, 0.16, 0.11, 0.08, 0.05, 0.03, 0.01];
      for (const [day, total] of visitDays) {
        let at = 8 * 3600;
        for (const share of shares) {
          const seconds = Math.max(20, Math.round(total * share));
          await s.recordSession({ dateKey: day, domain: topSite, startSec: at, seconds });
          at += seconds + 1500;
        }
      }
      const now = Date.now();
      for (let d = 1; d <= 9; d++) {
        await s.addFocusLog({ start: now - d * 86400000, end: now - d * 86400000 + 1500000, cycles: 2, completedCycles: d % 4 === 0 ? 1 : 2, workedMs: d % 4 === 0 ? 1500000 : 3000000, endedEarly: d % 4 === 0 });
      }
    }, `${ext.base}src/lib/storage.js`, topSite, visitDays);

    const dash = await ext.openPage('src/dashboard/dashboard.html', { viewport: DASHBOARD });
    await dash.waitForSelector('#summaryCards .stat-card');
    await dash.waitForSelector('#budgetWrap:not(.hidden) .cb-row');
    await pause(700);
    await shot(dash, '01-overview.jpg');

    await dash.click('.nav-item[data-tab="sites"]');
    await dash.waitForSelector('#sitesBody tr');
    await dash.$$eval('#sitesBody tr', (rows, site) => rows.find((r) => r.dataset.domain === site).click(), topSite);
    await dash.waitForSelector('#detailSessionChart svg');
    await pause(500);
    await shot(dash, '02-site-detail.jpg');
    await dash.keyboard.press('Escape');

    await dash.click('.nav-item[data-tab="insights"]');
    await dash.waitForSelector('#heatmap svg');
    await dash.waitForSelector('#focusTrendChart svg');
    await pause(700);
    await shot(dash, '03-insights.jpg');
    await dash.close();

    // The popup is 380 px wide: photograph it, then centre it on a 1280x800 canvas.
    const popup = await ext.openPage('src/popup/popup.html', { viewport: { width: 380, height: 640 } });
    await popup.waitForSelector('#todayTotal');
    await pause(500);
    const popupPng = (await popup.screenshot({ type: 'png' })).toString('base64');
    await popup.close();
    const canvas = await ext.browser.newPage();
    await canvas.setViewport(SIZE);
    await canvas.setContent(`<body style="margin:0;height:800px;display:grid;place-items:center;background:radial-gradient(900px 500px at 70% 10%,#2a2150,transparent),radial-gradient(800px 500px at 0% 90%,#1b2350,transparent),#0c0c14">
      <img src="data:image/png;base64,${popupPng}" style="height:700px;border-radius:18px;box-shadow:0 30px 80px rgba(0,0,0,.6)"></body>`);
    await shot(canvas, '04-popup.jpg');
    await canvas.close();

    await ext.message('startFocus', { minutes: 25 });
    const block = await ext.openPage('src/blocked/blocked.html?d=youtube.com', { viewport: SIZE });
    await block.waitForSelector('#domain');
    await pause(900);
    await shot(block, '05-focus-mode.jpg');
    await block.close();
    await ext.message('stopFocus');
  }
} finally {
  await ext.close();
}
console.log(`done → ${path.relative(root, outRoot)}`);
