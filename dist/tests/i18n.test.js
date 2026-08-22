// Guards the runtime i18n dictionary (extension/src/lib/i18n.js). The one thing
// most likely to regress as languages are added: a key present in one language
// but missing (or with mismatched {placeholders}) in another — that shows up as
// silently-wrong or fallback text in production, not a crash, so it needs an
// explicit parity check rather than relying on manual review.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setLang, getLang, dir, locale, t, categoryLabel } from '../../extension/src/lib/i18n.js';

const LANGS = ['he', 'en', 'ar', 'ru', 'es', 'fr'];

// Reach into the module's internal dictionary via t()/getLang() only (no direct
// DICT export) — build a snapshot per language by switching setLang() and
// reading back every key t() would resolve. Since t() falls back to `he` for a
// missing key, we detect "missing in language X" by checking whether X's own
// value differs from the raw key echo AND from he's value in a way that proves
// it actually has its own entry — simplest reliable approach is to re-import
// the dictionary shape via a keys list captured from `he`, then compare against
// a fresh module state per language using the exported t().
//
// t()'s fallback-to-he behavior means a *missing* key in another language is
// invisible from t() alone (it silently returns the Hebrew string). So this
// test reads the module source directly to extract the real per-language key
// sets — the only way to catch "silently falls back" as a real failure.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const i18nPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../extension/src/lib/i18n.js');
const src = fs.readFileSync(i18nPath, 'utf8');
const dictMatch = src.match(/const DICT = (\{[\s\S]*?\n\};)/);
if (!dictMatch) throw new Error('could not locate DICT in i18n.js — test needs updating to match file structure');
// eslint-disable-next-line no-new-func -- trusted local source file, not user input
const DICT = new Function(`return ${dictMatch[1].slice(0, -1)}`)();

test('every language has the exact same key set as Hebrew (the source language)', () => {
  const refKeys = new Set(Object.keys(DICT.he));
  assert.ok(refKeys.size > 200, 'sanity check: he dictionary looks too small, did the regex match wrong?');
  for (const l of LANGS) {
    const keys = new Set(Object.keys(DICT[l]));
    const missing = [...refKeys].filter((k) => !keys.has(k));
    const extra = [...keys].filter((k) => !refKeys.has(k));
    assert.deepEqual(missing, [], `${l} is missing keys present in he`);
    assert.deepEqual(extra, [], `${l} has keys not present in he (stale or typo'd key)`);
  }
});

test('every {placeholder} token in he is present (and only those) in every other language', () => {
  const placeholders = (s) => [...(s.match(/\{[a-zA-Z]+\}/g) || [])].sort().join(',');
  for (const l of LANGS) {
    for (const key of Object.keys(DICT.he)) {
      const refPh = placeholders(DICT.he[key]);
      const gotPh = placeholders(DICT[l][key]);
      assert.equal(gotPh, refPh, `${l}['${key}'] placeholder mismatch: he has [${refPh}], ${l} has [${gotPh}]`);
    }
  }
});

test('no language accidentally left a value identical to a literal {key} placeholder-less copy of he by omission', () => {
  // Weak but cheap smoke test: every non-Hebrew language should differ from he
  // on the bulk of its values (catches an accidental he: {...} spread/copy-paste
  // that technically satisfies the key-parity test above but ships untranslated text).
  for (const l of LANGS) {
    if (l === 'he') continue;
    const keys = Object.keys(DICT.he);
    const identical = keys.filter((k) => DICT[l][k] === DICT.he[k]);
    // A handful of values are legitimately identical across languages (e.g. 'TimeTrack',
    // raw domain examples, 'AES-256', keyboard shortcuts) - only flag if most of them match,
    // which would mean the whole block never got translated.
    assert.ok(identical.length < keys.length * 0.5,
      `${l} has ${identical.length}/${keys.length} values identical to he — looks untranslated`);
  }
});

test('dir() and locale() resolve correctly for every supported language', () => {
  const expected = {
    he: 'rtl', en: 'ltr', ar: 'rtl', ru: 'ltr', es: 'ltr', fr: 'ltr',
  };
  for (const l of LANGS) {
    setLang(l);
    assert.equal(getLang(), l);
    assert.equal(dir(), expected[l], `${l} should be ${expected[l]}`);
    assert.ok(locale().length > 0, `${l} should have a non-empty locale tag`);
  }
  setLang('he'); // restore default
});

test('setLang falls back to Hebrew for an unsupported language code', () => {
  setLang('xx-not-a-real-lang');
  assert.equal(getLang(), 'he');
  assert.equal(dir(), 'rtl');
});

test('t() resolves real strings (not raw keys) in every language, with vars substituted', () => {
  for (const l of LANGS) {
    setLang(l);
    assert.notEqual(t('nav.overview'), 'nav.overview', `${l} fell back to the raw key`);
    const withVar = t('hint.avgPerDay', { v: '5m' });
    assert.ok(withVar.includes('5m'), `${l} did not substitute {v}`);
    assert.ok(!withVar.includes('{v}'), `${l} left an unsubstituted {v} placeholder`);
  }
  setLang('he');
});

test('categoryLabel resolves every category key in every language', () => {
  const cats = ['productivity', 'reference', 'communication', 'news', 'finance', 'shopping', 'social', 'entertainment', 'other'];
  for (const l of LANGS) {
    setLang(l);
    for (const c of cats) {
      const label = categoryLabel(c);
      assert.notEqual(label, `category.${c}`, `${l} category "${c}" fell back to the raw key`);
    }
  }
  setLang('he');
});
