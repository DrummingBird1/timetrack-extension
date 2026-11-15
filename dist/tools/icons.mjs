// Renders the extension's toolbar / store icons from the brand mark.
//
//   node tools/icons.mjs
//
// 16 and 32 px use the simplified mark so the ring stays readable in the toolbar.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';
import { markSvg } from './brand.mjs';

const extDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../extension');
const outDir = path.join(extDir, 'icons');
// the same mark as a file the popup and dashboard use as a CSS background
fs.writeFileSync(path.join(extDir, 'src/brand-mark.svg'), `${markSvg(88)}\n`);
const browser = await puppeteer.launch();
try {
  for (const size of [16, 32, 48, 128]) {
    const page = await browser.newPage();
    await page.setViewport({ width: size, height: size, deviceScaleFactor: 1 });
    // Render big and let the browser downscale: smoother than drawing the 88-unit art directly at 16 px.
    const render = size * 4;
    await page.setContent(`<!doctype html><style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${markSvg(render, { small: size <= 32 })}`);
    const png = await page.screenshot({ type: 'png', omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
    fs.writeFileSync(path.join(outDir, `icon${size}.png`), png);
    console.log(`  icon${size}.png`);
    await page.close();
  }
} finally {
  await browser.close();
}
