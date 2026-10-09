// WCAG 2.1 AA colour contrast for the text colours in every theme, computed straight from
// the CSS custom properties (so it runs without a browser and catches a bad token at the
// source). Body text needs 4.5:1; axe-core in the E2E suite covers what actually renders.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8').replace(/\r\n/g, '\n');

/** Custom properties declared in the first rule whose selector line matches `selector`. */
function tokens(css, selector) {
  const start = css.indexOf(selector);
  assert.ok(start >= 0, `selector not found: ${selector}`);
  const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start));
  return Object.fromEntries([...body.matchAll(/(--[\w-]+)\s*:\s*(#[0-9a-fA-F]{6})\b/g)].map((m) => [m[1], m[2]]));
}

const channel = (c) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
function luminance(hex) {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}
export function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function check(name, theme, texts, backgrounds) {
  for (const [textName, text] of Object.entries(texts)) {
    for (const [bgName, bg] of Object.entries(backgrounds)) {
      const ratio = contrast(text, bg);
      assert.ok(ratio >= 4.5, `${name} (${theme}): ${textName} ${text} on ${bgName} ${bg} is ${ratio.toFixed(2)}:1 (needs 4.5:1)`);
    }
  }
}
const pick = (obj, keys) => Object.fromEntries(keys.filter((k) => obj[k]).map((k) => [k, obj[k]]));

test('contrast helper matches known WCAG values', () => {
  assert.equal(Math.round(contrast('#000000', '#ffffff')), 21);
  assert.equal(contrast('#777777', '#777777'), 1);
  assert.ok(Math.abs(contrast('#767676', '#ffffff') - 4.54) < 0.02, 'the classic #767676-on-white AA threshold');
});

test('dashboard: text colours pass AA on every surface, in both themes', () => {
  const css = read('extension/src/dashboard/dashboard.css');
  const dark = tokens(css, ':root {');
  const light = { ...dark, ...tokens(css, ':root[data-theme="light"]') };
  for (const [theme, t] of [['dark', dark], ['light', light]]) {
    check('dashboard', theme, pick(t, ['--text', '--text-dim', '--text-faint', '--accent-text', '--green-text', '--danger-text', '--warn-text']), pick(t, ['--bg', '--surface', '--surface-2', '--surface-3']));
  }
});

test('popup: text colours pass AA on every surface, in both themes', () => {
  const css = read('extension/src/popup/popup.css');
  const dark = tokens(css, ':root {');
  const light = { ...dark, ...tokens(css, '@media (prefers-color-scheme: light)') };
  for (const [theme, t] of [['dark', dark], ['light', light]]) {
    check('popup', theme, pick(t, ['--text', '--text-dim', '--text-faint']), pick(t, ['--bg', '--surface', '--surface-2', '--surface-3']));
  }
});

test('marketing site: text colours pass AA on its backgrounds', () => {
  const css = read('store-assets/site/index.html');
  const t = tokens(css, ':root{');
  check('site', 'dark', pick(t, ['--text', '--dim', '--faint']), pick(t, ['--bg', '--surface', '--surface-2', '--surface-3']));
});
