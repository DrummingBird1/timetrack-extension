// Renders the Chrome Web Store promo graphics from the brand mark + a real screenshot:
//   store-assets/promo/promo-tile-440x280.png      (small promo tile — required by the store)
//   store-assets/promo/promo-marquee-1400x560.png  (marquee — optional)
//
//   node tools/promo-tiles.mjs
//
// Run tools/screenshots.mjs first: the marquee embeds screenshots/en/01-overview.jpg.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const outDir = path.join(root, 'store-assets/promo');
const shotPath = path.join(root, 'store-assets/screenshots/en/01-overview.jpg');
const shot = `data:image/jpeg;base64,${fs.readFileSync(shotPath).toString('base64')}`;

const FONT = "'Segoe UI', -apple-system, Helvetica, Arial, sans-serif";
const MARK = (size) => `
  <svg width="${size}" height="${size}" viewBox="0 0 88 88" aria-hidden="true">
    <defs><linearGradient id="m" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8b5cf6"/><stop offset="1" stop-color="#6366f1"/></linearGradient></defs>
    <rect width="88" height="88" rx="24" fill="url(#m)"/>
    <circle cx="44" cy="44" r="24" fill="none" stroke="#fff" stroke-width="5" stroke-dasharray="113 38" transform="rotate(45 44 44)"/>
  </svg>`;

const base = (w, h, body) => `<!doctype html><meta charset="utf-8"><style>
  * { box-sizing: border-box; margin: 0; }
  body { width: ${w}px; height: ${h}px; overflow: hidden; font-family: ${FONT}; color: #ececf4; position: relative;
    background: radial-gradient(${w * 0.7}px ${h * 0.9}px at 90% 0%, rgba(139,92,246,.30), transparent), radial-gradient(${w * 0.5}px ${h * 0.7}px at 0% 15%, rgba(99,102,241,.22), transparent), #0c0c14; }
  .brand { display: flex; align-items: center; }
  .word { font-weight: 800; letter-spacing: -1px; }
  .sub { color: #9595ad; }
  .accent { background: linear-gradient(135deg,#8b5cf6,#6366f1); -webkit-background-clip: text; background-clip: text; color: transparent; font-weight: 700; }
</style><body>${body}</body>`;

const tile = base(440, 280, `
  <div style="position:absolute;left:36px;top:52px" class="brand">${MARK(84)}</div>
  <div style="position:absolute;left:36px;top:156px">
    <div class="word" style="font-size:46px;line-height:1">TimeTrack</div>
    <div class="sub" style="font-size:17px;margin-top:10px">Smart browsing-time tracker</div>
    <div class="accent" style="font-size:14px;margin-top:8px">Private · Local-first · Focus mode</div>
  </div>`);

const marquee = base(1400, 560, `
  <div style="position:absolute;left:84px;top:96px;width:560px">
    <div class="brand" style="gap:22px">${MARK(96)}<div class="word" style="font-size:68px">TimeTrack</div></div>
    <div style="font-size:34px;font-weight:700;line-height:1.25;margin-top:44px">See where your time really goes.</div>
    <div class="sub" style="font-size:21px;line-height:1.5;margin-top:16px">Per-site analytics, goals &amp; budgets, focus mode and encrypted backup — all stored on your device.</div>
    <div class="accent" style="font-size:19px;margin-top:26px">No account · No analytics · No remote code</div>
  </div>
  <img src="${shot}" style="position:absolute;left:720px;top:70px;width:840px;border-radius:18px;border:1.5px solid #2a2a3a;box-shadow:0 30px 80px rgba(0,0,0,.65)">`);

const browser = await puppeteer.launch();
try {
  for (const [name, html, w, h] of [['promo-tile-440x280.png', tile, 440, 280], ['promo-marquee-1400x560.png', marquee, 1400, 560]]) {
    const page = await browser.newPage();
    await page.setViewport({ width: w, height: h });
    await page.setContent(html, { waitUntil: 'load' });
    await page.screenshot({ path: path.join(outDir, name), type: 'png', omitBackground: false });
    await page.close();
    console.log(`  ${name}`);
  }
} finally {
  await browser.close();
}
