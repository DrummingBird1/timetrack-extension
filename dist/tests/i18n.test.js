// Guards the runtime i18n dictionaries (extension/src/lib/locales/*.json) and the
// loader in i18n.js. The thing most likely to regress as languages are added: a key
// present in one language but missing (or with mismatched {placeholders}) in
// another — that shows up as silently-wrong or fallback text in production, not a
// crash, so it needs an explicit parity check rather than manual review.
//
// The JSON files are read directly here (not through t()), because t() falls back to
// Hebrew for a missing key, which would hide exactly the failure we want to catch.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { LOCALES_DIR, readLocale } from './helpers/node-locales.js';
import {
  setLang, getLang, dir, locale, t, categoryLabel, setLocaleLoader, SUPPORTED_LANGS,
} from '../../extension/src/lib/i18n.js';

const LANGS = ['he', 'en', 'ar', 'ru', 'es', 'fr'];
const realLoader = async (l) => readLocale(l);

// ---- loader behaviour (kept first: these use languages the later tests load for real) ----
test('a dictionary is fetched once even when setLang is called concurrently', async () => {
  let calls = 0;
  setLocaleLoader(async (l) => { calls++; return readLocale(l); });
  await Promise.all([setLang('es'), setLang('es'), setLang('es')]);
  await setLang('es');
  assert.equal(calls, 1);
  assert.equal(getLang(), 'es');
  setLocaleLoader(realLoader);
});

test('a language whose dictionary fails to load falls back to Hebrew instead of leaving the UI blank', async () => {
  setLocaleLoader(async (l) => { if (l === 'fr') throw new Error('network down'); return readLocale(l); });
  const warn = console.warn;
  console.warn = () => {};
  try {
    await setLang('fr');
  } finally {
    console.warn = warn;
    setLocaleLoader(realLoader);
  }
  assert.equal(getLang(), 'he');
  assert.equal(dir(), 'rtl');
  assert.notEqual(t('nav.overview'), 'nav.overview', 'Hebrew text is available');
});

test('a key missing from the active language falls back to Hebrew, then to the key itself', async () => {
  await setLang('he');
  setLocaleLoader(async (l) => (l === 'ru' ? { 'only.in.ru': 'да' } : readLocale(l)));
  await setLang('ru');
  setLocaleLoader(realLoader);
  assert.equal(t('only.in.ru'), 'да');
  assert.equal(t('nav.overview'), readLocale('he')['nav.overview'], 'falls back to he');
  assert.equal(t('totally.unknown.key'), 'totally.unknown.key', 'last resort: the key');
});

// ---- dictionary parity ----
const DICT = Object.fromEntries(LANGS.map((l) => [l, readLocale(l)]));

test('the supported-language list matches the locale files on disk', () => {
  const onDisk = fs.readdirSync(LOCALES_DIR).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).sort();
  assert.deepEqual([...SUPPORTED_LANGS].sort(), onDisk, 'LANG_META and locales/*.json are out of sync');
  assert.deepEqual([...SUPPORTED_LANGS].sort(), [...LANGS].sort());
});

test('every language has the exact same key set as Hebrew (the source language)', () => {
  const refKeys = new Set(Object.keys(DICT.he));
  assert.ok(refKeys.size > 200, 'sanity check: he dictionary looks too small');
  for (const l of LANGS) {
    const keys = new Set(Object.keys(DICT[l]));
    const missing = [...refKeys].filter((k) => !keys.has(k));
    const extra = [...keys].filter((k) => !refKeys.has(k));
    assert.deepEqual(missing, [], `${l} is missing keys present in he`);
    assert.deepEqual(extra, [], `${l} has keys not present in he (stale or typo'd key)`);
  }
});

test('every dictionary value is a non-empty string', () => {
  for (const l of LANGS) {
    for (const [k, v] of Object.entries(DICT[l])) {
      assert.equal(typeof v, 'string', `${l}['${k}'] is not a string`);
      assert.ok(v.trim().length > 0, `${l}['${k}'] is empty`);
    }
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

test('no language is a copy of Hebrew by omission', () => {
  // Weak but cheap smoke test: every non-Hebrew language should differ from he on the
  // bulk of its values. A handful are legitimately identical across languages (e.g.
  // 'TimeTrack', raw domain examples, 'AES-256', keyboard shortcuts) — only flag it if
  // most match, which would mean the whole block never got translated.
  for (const l of LANGS) {
    if (l === 'he') continue;
    const keys = Object.keys(DICT.he);
    const identical = keys.filter((k) => DICT[l][k] === DICT.he[k]);
    assert.ok(identical.length < keys.length * 0.5,
      `${l} has ${identical.length}/${keys.length} values identical to he — looks untranslated`);
  }
});

// ---- runtime API ----
test('dir() and locale() resolve correctly for every supported language', async () => {
  const expected = { he: 'rtl', en: 'ltr', ar: 'rtl', ru: 'ltr', es: 'ltr', fr: 'ltr' };
  for (const l of LANGS) {
    await setLang(l);
    assert.equal(getLang(), l);
    assert.equal(dir(), expected[l], `${l} should be ${expected[l]}`);
    assert.ok(locale().length > 0, `${l} should have a non-empty locale tag`);
  }
  await setLang('he');
});

test('setLang falls back to Hebrew for an unsupported language code', async () => {
  await setLang('xx-not-a-real-lang');
  assert.equal(getLang(), 'he');
  assert.equal(dir(), 'rtl');
});

test('t() resolves real strings (not raw keys) in every language, with vars substituted', async () => {
  for (const l of LANGS) {
    await setLang(l);
    assert.notEqual(t('nav.overview'), 'nav.overview', `${l} fell back to the raw key`);
    const withVar = t('hint.avgPerDay', { v: '5m' });
    assert.ok(withVar.includes('5m'), `${l} did not substitute {v}`);
    assert.ok(!withVar.includes('{v}'), `${l} left an unsubstituted {v} placeholder`);
  }
  await setLang('he');
});

test('categoryLabel resolves every category key in every language', async () => {
  const cats = ['productivity', 'reference', 'communication', 'news', 'finance', 'shopping', 'social', 'entertainment', 'other'];
  for (const l of LANGS) {
    await setLang(l);
    for (const c of cats) {
      const label = categoryLabel(c);
      assert.notEqual(label, `category.${c}`, `${l} category "${c}" fell back to the raw key`);
    }
  }
  await setLang('he');
});
