// Puts the current brand mark (tools/brand.mjs) into the static art that embeds it:
// the README banner, the hero illustration and the marketing site (header mark + favicon).
// Idempotent: it replaces the previous mark each time. The extension icons and the in-app mark come from tools/icons.mjs.
//
//   node tools/brand-apply.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { markSvg, markDataUri } from './brand.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const write = (p, s) => fs.writeFileSync(path.join(root, p), s);
/** A mark placed at x,y with a size, as a nested <svg> (keeps its own gradient ids). */
const nested = (x, y, size, opts) => markSvg(size, opts).replace('<svg ', `<svg x="${x}" y="${y}" `).replace(/\s*\n\s*/g, ' ');

function swap(file, pattern, replacement, what) {
  const s = read(file);
  if (!pattern.test(s)) throw new Error(`${file}: ${what} not found`);
  write(file, s.replace(pattern, replacement));
  console.log(`  ${file}`);
}

// README banner: <rect x="536" .../> + <circle .../> (old) or a previous nested mark
swap('store-assets/promo/readme-banner.svg',
  /(?:<rect x="536" y="60"[^>]*\/>\s*<circle cx="584"[^>]*\/>|<svg x="536" y="60"[\s\S]*?<\/svg>)/,
  nested(536, 60, 96), 'mark');

// hero illustration (the small mark in the window card)
swap('store-assets/promo/hero.svg',
  /(?:<rect x="112" y="140"[^>]*\/>\s*<circle cx="138"[^>]*\/>|<svg x="112" y="140"[\s\S]*?<\/svg>)/,
  nested(112, 140, 52, { small: true }), 'mark');

// site: header mark + favicon, both as data: URIs (the page makes no external requests)
{
  const file = 'store-assets/site/index.html';
  let s = read(file);
  const uri = markDataUri();
  s = s.replace(/\.mark\{[^}]*\}\s*\.mark::after\{[^}]*\}/,
    `.mark{width:38px;height:38px;border-radius:11px;flex-shrink:0;box-shadow:0 6px 18px rgba(99,102,241,.25);\n    background:url("${uri}") center/contain no-repeat}`);
  s = s.replace(/\.mark\{width:38px;height:38px;border-radius:11px;flex-shrink:0;[^}]*\}/,
    `.mark{width:38px;height:38px;border-radius:11px;flex-shrink:0;box-shadow:0 6px 18px rgba(99,102,241,.25);\n    background:url("${uri}") center/contain no-repeat}`);
  // the same small mark inside the inline hero illustration
  s = s.replace(/(?:<rect x="112" y="140"[^>]*\/>\s*<circle cx="138"[^>]*\/>|<svg x="112" y="140"[\s\S]*?<\/svg>)/, nested(112, 140, 52, { small: true }));
  if (!/rel="icon"/.test(s)) s = s.replace('<style>', `<link rel="icon" type="image/svg+xml" href="${uri}" />\n<style>`);
  else s = s.replace(/<link rel="icon"[^>]*\/>/, `<link rel="icon" type="image/svg+xml" href="${uri}" />`);
  write(file, s);
  console.log(`  ${file}`);
}
