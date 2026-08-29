#!/usr/bin/env node
// Generates a branded per-version banner SVG for GitHub Release notes.
// Usage: node make-release-banner.mjs <version> <themeKey> "<tagline>"
// Example: node make-release-banner.mjs 1.4.0 cloud "Backup & sites trust"
//
// Every release keeps the same TimeTrack brand mark + wordmark + palette (for a
// recognizable family), but gets its own theme icon + tagline reflecting what
// that release actually shipped — that's what makes each version "its own logo"
// rather than just a re-labeled template. Add a new icon to THEMES below for
// releases that don't fit the existing ones; run this for every future release
// and commit the output to store-assets/promo/releases/v<version>.svg (see the
// "Release banners" note in CLAUDE.md).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const [, , version, themeKey, tagline] = process.argv;
if (!version || !themeKey || !tagline) {
  console.error('Usage: node make-release-banner.mjs <version> <themeKey> "<tagline>"');
  console.error('Theme keys:', Object.keys(THEMES ?? {}).join(', '));
  process.exit(1);
}

// 24x24-viewBox icon paths, same hand-rolled style as the dashboard's own nav icons.
const THEMES = {
  timer: '<path d="M12 2a10 10 0 100 20 10 10 0 000-20zm1 11h-2V6h2v5l4 2-1 1.7L13 13z"/>', // focus mode
  search: '<path d="M15.5 14h-.79l-.28-.27a6.5 6.5 0 10-.7.7l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0A4.5 4.5 0 119.5 5a4.5 4.5 0 010 9z"/>', // reachability / discoverability
  shield: '<path d="M12 2l8 4v6c0 5-3.4 8.7-8 10-4.6-1.3-8-5-8-10V6l8-4zm0 2.2L6 7v5c0 3.7 2.4 6.7 6 7.8 3.6-1.1 6-4.1 6-7.8V7l-6-2.8z"/><path d="M11 12.5l-1.8-1.8-1.4 1.4L11 15.3l5.2-5.2-1.4-1.4z"/>', // security / trust fixes
  globe: '<path d="M12 2a10 10 0 100 20 10 10 0 000-20zm0 2c1.5 1.8 2.4 4.6 2.5 8H9.5c.1-3.4 1-6.2 2.5-8zM4 12a8 8 0 015-7.4A18 18 0 007.5 12 18 18 0 009 19.4 8 8 0 014 12zm11 7.4A18 18 0 0016.5 12 18 18 0 0015 4.6 8 8 0 0115 19.4z"/>', // languages / site
  cloud: '<path d="M19 18H6a4 4 0 01-.4-7.98A6 6 0 0118 9.5a3.5 3.5 0 011 6.5z"/>', // backup / trust
  rocket: '<path d="M12 2c3 2 5 6 5 10 0 1.5-.3 2.8-.8 4l2.3 2.3-1.4 1.4-2.1-2.1c-.8.6-1.7 1-2.6 1.3l-.4 3-2 0-.4-3c-.9-.3-1.8-.7-2.6-1.3l-2.1 2.1-1.4-1.4L5.8 16c-.5-1.2-.8-2.5-.8-4 0-4 2-8 5-10 .9-.6 1.2-.6 2 0zm0 6a2 2 0 100 4 2 2 0 000-4z"/>', // general feature release
};

if (!THEMES[themeKey]) {
  console.error(`Unknown theme "${themeKey}". Add it to THEMES in this script, or use one of: ${Object.keys(THEMES).join(', ')}`);
  process.exit(1);
}

function svg(version, themeKey, tagline) {
  const icon = THEMES[themeKey];
  return `<svg viewBox="0 0 1280 320" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="mark" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#8b5cf6"/><stop offset="1" stop-color="#6366f1"/>
    </linearGradient>
    <radialGradient id="glowA" cx="0.88" cy="0.1" r="0.7">
      <stop offset="0" stop-color="#8b5cf6" stop-opacity="0.30"/><stop offset="1" stop-color="#8b5cf6" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glowB" cx="0.05" cy="0.2" r="0.6">
      <stop offset="0" stop-color="#6366f1" stop-opacity="0.22"/><stop offset="1" stop-color="#6366f1" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1280" height="320" rx="20" fill="#0c0c14"/>
  <rect width="1280" height="320" rx="20" fill="url(#glowA)"/>
  <rect width="1280" height="320" rx="20" fill="url(#glowB)"/>
  <rect width="1280" height="320" rx="20" fill="none" stroke="#2a2a3a" stroke-width="1.5"/>

  <!-- brand mark -->
  <rect x="64" y="88" width="88" height="88" rx="24" fill="url(#mark)"/>
  <circle cx="108" cy="132" r="24" fill="none" stroke="#ffffff" stroke-width="5" stroke-dasharray="113 38" transform="rotate(45 108 132)"/>

  <!-- wordmark + tagline -->
  <text x="172" y="140" font-family="Segoe UI, -apple-system, Helvetica, Arial, sans-serif" font-size="56" font-weight="800" fill="#ececf4" letter-spacing="-1">TimeTrack</text>
  <text x="172" y="175" font-family="Segoe UI, -apple-system, Helvetica, Arial, sans-serif" font-size="21" fill="#9595ad">${escapeXml(tagline)}</text>

  <!-- version pill -->
  <rect x="64" y="208" width="${118 + version.length * 15.5}" height="46" rx="23" fill="#1c1c28" stroke="#2a2a3a"/>
  <text x="92" y="238" font-family="Segoe UI, -apple-system, Helvetica, Arial, sans-serif" font-size="22" font-weight="700" fill="url(#mark)">v${escapeXml(version)}</text>

  <!-- theme icon, large + subtle, right side -->
  <g transform="translate(1120,160) scale(4.2)" fill="#ececf4" opacity="0.92">
    <g transform="translate(-12,-12)">${icon}</g>
  </g>
  <g transform="translate(1120,160) scale(4.2)" fill="url(#mark)" opacity="0.35">
    <g transform="translate(-12,-12)">${icon}</g>
  </g>
</svg>
`;
}

function escapeXml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'store-assets', 'promo', 'releases');
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, `v${version}.svg`);
fs.writeFileSync(outPath, svg(version, themeKey, tagline));
console.log(`Wrote ${outPath}`);
