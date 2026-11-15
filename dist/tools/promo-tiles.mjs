// Renders the promo graphics from the brand mark (tools/brand.mjs) and real screenshots:
//   store-assets/promo/promo-tile-440x280.png      small promo tile (required by the Chrome Web Store)
//   store-assets/promo/promo-marquee-1400x560.png  marquee (optional in the Store)
//   store-assets/promo/social-1200x630.png         link preview (GitHub social preview, Open Graph)
//
//   node tools/promo-tiles.mjs
//
// Run tools/screenshots.mjs first: the marquee and the social image embed screenshots/en/*.jpg.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';
import { markSvg, PALETTE as C } from './brand.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const outDir = path.join(root, 'store-assets/promo');
const img = (name) => `data:image/jpeg;base64,${fs.readFileSync(path.join(root, 'store-assets/screenshots/en', name)).toString('base64')}`;
const overview = img('01-overview.jpg');
const insights = img('03-insights.jpg');
const popup = img('04-popup.jpg');

const FONT = "'Segoe UI Variable Display', 'Segoe UI', -apple-system, 'Helvetica Neue', Arial, sans-serif";

const css = (w, h) => `
  * { box-sizing: border-box; margin: 0; }
  body { width: ${w}px; height: ${h}px; overflow: hidden; font-family: ${FONT}; color: ${C.text}; position: relative; background: ${C.ink}; }
  .bg { position: absolute; inset: 0;
    background:
      radial-gradient(${w * 0.55}px ${h * 0.95}px at 100% 0%, rgba(139,92,246,.42), transparent 70%),
      radial-gradient(${w * 0.45}px ${h * 0.8}px at 0% 100%, rgba(34,211,238,.20), transparent 70%),
      radial-gradient(${w * 0.4}px ${h * 0.6}px at 45% 115%, rgba(99,102,241,.28), transparent 70%); }
  .dots { position: absolute; inset: 0; opacity: .5;
    background-image: radial-gradient(rgba(255,255,255,.07) 1px, transparent 1.2px); background-size: 22px 22px;
    -webkit-mask-image: linear-gradient(120deg, #000 0%, transparent 60%); mask-image: linear-gradient(120deg, #000 0%, transparent 60%); }
  .brand { display: flex; align-items: center; }
  .brand svg { filter: drop-shadow(0 10px 28px rgba(99,102,241,.55)); }
  .word { font-weight: 800; letter-spacing: -.03em; line-height: 1; }
  .grad { background: linear-gradient(120deg, #c4b5fd, #818cf8 45%, #22d3ee); -webkit-background-clip: text; background-clip: text; color: transparent; }
  .dim { color: ${C.dim}; }
  .chips { display: flex; flex-wrap: wrap; gap: 8px; }
  .chip { display: inline-flex; align-items: center; gap: 7px; padding: 6px 12px 6px 10px; border-radius: 999px; font-weight: 600;
    background: rgba(255,255,255,.07); border: 1px solid rgba(255,255,255,.12); color: #dcdcec; backdrop-filter: blur(6px); }
  .chip i { width: 7px; height: 7px; border-radius: 50%; display: inline-block; }
  .shot { position: absolute; border-radius: 16px; border: 1.5px solid rgba(255,255,255,.14); box-shadow: 0 40px 90px rgba(0,0,0,.7), 0 0 0 1px rgba(0,0,0,.4); overflow: hidden; background: #0f0f18; }
  .shot img { display: block; }
`;

const page = (w, h, body) => `<!doctype html><meta charset="utf-8"><style>${css(w, h)}</style><body><div class="bg"></div><div class="dots"></div>${body}</body>`;

const chip = (label, color, size = 13) => `<span class="chip" style="font-size:${size}px"><i style="background:${color}"></i>${label}</span>`;

// ---- small tile 440x280
const tile = page(440, 280, `
  <div style="position:absolute;right:-70px;top:-60px;opacity:.9">
    <svg width="300" height="300" viewBox="0 0 88 88"><circle cx="44" cy="44" r="26" fill="none" stroke="rgba(255,255,255,.07)" stroke-width="7"/>
      <path d="M44 18 A26 26 0 1 1 18 44" fill="none" stroke="url(#tg)" stroke-width="7" stroke-linecap="round"/>
      <defs><linearGradient id="tg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8b5cf6" stop-opacity=".55"/><stop offset="1" stop-color="#22d3ee" stop-opacity=".55"/></linearGradient></defs></svg>
  </div>
  <div style="position:absolute;left:34px;top:34px" class="brand">${markSvg(76)}</div>
  <div style="position:absolute;left:34px;top:128px">
    <div class="word" style="font-size:50px">TimeTrack</div>
    <div class="dim" style="font-size:17px;margin-top:11px;font-weight:500">See where your time really goes.</div>
  </div>
  <div class="chips" style="position:absolute;left:34px;bottom:30px">
    ${chip('Private', C.green, 12.5)}${chip('Focus mode', C.pink, 12.5)}${chip('6 languages', C.amber, 12.5)}
  </div>`);

// ---- marquee 1400x560
const popupCrop = (width) => {
  // the popup sits at x 432..848, y 50..750 of the 1280x800 canvas; show just that card
  const scale = width / 416;
  return `<div class="shot" style="width:${width}px;height:${700 * scale}px;border-radius:${18 * scale}px;">
    <img src="${popup}" style="width:${1280 * scale}px;margin-left:${-432 * scale}px;margin-top:${-50 * scale}px"></div>`;
};
const marquee = page(1400, 560, `
  <div style="position:absolute;left:84px;top:78px;width:600px">
    <div class="brand" style="gap:20px">${markSvg(70)}<div class="word" style="font-size:54px">TimeTrack</div></div>
    <div style="font-size:50px;font-weight:800;line-height:1.1;margin-top:44px;letter-spacing:-.03em">See where your time<br><span class="grad">really goes.</span></div>
    <div class="dim" style="font-size:21px;line-height:1.5;margin-top:20px;max-width:540px">Per-site analytics, tags &amp; budgets, focus mode and backups you control &mdash; all stored on your device.</div>
    <div class="chips" style="margin-top:28px">
      ${chip('Private by design', C.green, 15)}${chip('Tags &amp; budgets', C.violet, 15)}${chip('Focus mode', C.pink, 15)}${chip('Backup anywhere', C.cyan, 15)}
    </div>
  </div>
  <div style="position:absolute;left:700px;top:50px;width:760px;perspective:2200px">
    <div class="shot" style="position:relative;width:760px;transform:rotateY(-9deg) rotateX(2deg);transform-origin:0 50%;"><img src="${overview}" style="width:760px"></div>
  </div>
  <div style="position:absolute;left:1118px;top:222px;transform:rotate(3deg)">${popupCrop(224)}</div>`);

// ---- social preview 1200x630
const social = page(1200, 630, `
  <div style="position:absolute;left:80px;top:74px;width:520px">
    <div class="brand" style="gap:22px">${markSvg(84)}<div class="word" style="font-size:62px">TimeTrack</div></div>
    <div style="font-size:54px;font-weight:800;line-height:1.1;margin-top:56px;letter-spacing:-.03em">Your browsing time, <span class="grad">finally clear.</span></div>
    <div class="dim" style="font-size:23px;line-height:1.5;margin-top:22px">Private, local-first Chrome extension. No account, no analytics.</div>
    <div class="chips" style="margin-top:30px">${chip('Tags &amp; budgets', C.violet, 16)}${chip('Focus mode', C.pink, 16)}${chip('6 languages', C.amber, 16)}</div>
  </div>
  <div style="position:absolute;left:640px;top:70px;perspective:2400px">
    <div class="shot" style="position:relative;width:760px;transform:rotateY(-10deg) rotateX(2deg);transform-origin:0 50%"><img src="${insights}" style="width:760px"></div>
  </div>`);

const browser = await puppeteer.launch();
try {
  for (const [name, html, w, h] of [
    ['promo-tile-440x280.png', tile, 440, 280],
    ['promo-marquee-1400x560.png', marquee, 1400, 560],
    ['social-1200x630.png', social, 1200, 630],
  ]) {
    const p = await browser.newPage();
    await p.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
    await p.setContent(html, { waitUntil: 'load' });
    await p.screenshot({ path: path.join(outDir, name), type: 'png', omitBackground: false });
    await p.close();
    console.log(`  ${name}`);
  }
} finally {
  await browser.close();
}
