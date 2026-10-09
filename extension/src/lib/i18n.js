// Runtime internationalization. Unlike chrome.i18n / _locales (which is locked to
// the browser UI locale), this lets the user switch language live from settings.
// Hebrew is the source/fallback language.
//
// Each language is a flat JSON dictionary in ./locales/<lang>.json, loaded on demand
// with fetch(): only the ACTIVE language is read (the service worker cold-starts on
// most ticks, so parsing all six every time was wasted work). fetch() rather than
// dynamic import() because service workers can't use import().
//
// To add a language: drop a <lang>.json next to the others (same keys as he.json —
// i18n.test.js enforces key and {placeholder} parity) and add it to LANG_META.

import { setDurationLocale } from './utils.js';

const FALLBACK = 'he';

// Per-language text direction and Intl locale tag. dir()/locale() key off this
// instead of a hardcoded he-is-the-only-RTL-language binary.
const LANG_META = {
  he: { dir: 'rtl', locale: 'he-IL' },
  en: { dir: 'ltr', locale: 'en-US' },
  ar: { dir: 'rtl', locale: 'ar' },
  ru: { dir: 'ltr', locale: 'ru-RU' },
  es: { dir: 'ltr', locale: 'es' },
  fr: { dir: 'ltr', locale: 'fr-FR' },
};

export const SUPPORTED_LANGS = Object.keys(LANG_META);

let lang = FALLBACK;
const dicts = {};      // lang -> dictionary, once loaded
const loading = {};    // lang -> in-flight load (dedupes concurrent setLang calls)

let loadDictionary = async (l) => {
  const res = await fetch(new URL(`./locales/${l}.json`, import.meta.url));
  if (!res.ok) throw new Error(`locale ${l}: HTTP ${res.status}`);
  return res.json();
};

/** Replace how dictionaries are read (Node tests can't fetch() a file: URL). */
export function setLocaleLoader(fn) {
  loadDictionary = fn;
}

async function ensureLoaded(l) {
  if (dicts[l]) return;
  loading[l] ||= loadDictionary(l).then((d) => { dicts[l] = d; }).finally(() => { delete loading[l]; });
  await loading[l];
}

/**
 * Switch the active language, loading its dictionary first. Unknown codes — and a
 * dictionary that fails to load — fall back to Hebrew, so the UI always has text.
 */
export async function setLang(l) {
  let next = LANG_META[l] ? l : FALLBACK;
  try {
    await ensureLoaded(next);
  } catch (e) {
    console.warn('[TimeTrack] could not load locale', next, e);
    if (next === FALLBACK) throw e;
    next = FALLBACK;
    await ensureLoaded(next);
  }
  lang = next;
  setDurationLocale(lang);
}

export function getLang() {
  return lang;
}

export function dir() {
  return (LANG_META[lang] || LANG_META[FALLBACK]).dir;
}

export function locale() {
  return (LANG_META[lang] || LANG_META[FALLBACK]).locale;
}

export function categoryLabel(key) {
  return t(`category.${key}`);
}

export function t(key, vars) {
  let s = dicts[lang] && dicts[lang][key];
  if (s == null) s = dicts[FALLBACK] && dicts[FALLBACK][key];
  if (s == null) s = key;
  if (vars) for (const k of Object.keys(vars)) s = s.split(`{${k}}`).join(vars[k]);
  return s;
}

/** Fill all [data-i18n] text and [data-i18n-ph]/[data-i18n-title] attributes. */
export function localize(root = document) {
  const all = (selector) => /** @type {NodeListOf<HTMLElement>} */ (root.querySelectorAll(selector));
  all('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  all('[data-i18n-ph]').forEach((el) => {
    const input = /** @type {HTMLInputElement} */ (el);
    input.placeholder = t(el.dataset.i18nPh);
    // A placeholder vanishes on input and is not a reliable name: reuse it as the accessible name
    // unless the control already has a real label.
    if (!input.hasAttribute('aria-labelledby') && !input.hasAttribute('data-i18n-aria') && !(input.labels && input.labels.length)) {
      input.setAttribute('aria-label', input.placeholder);
    }
  });
  all('[data-i18n-aria]').forEach((el) => { el.setAttribute('aria-label', t(el.dataset.i18nAria)); });
  all('[data-i18n-title]').forEach((el) => { el.title = t(el.dataset.i18nTitle); });
}
