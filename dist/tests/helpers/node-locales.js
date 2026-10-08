// Node can't fetch() a file: URL, so give i18n.js a loader that reads the real
// locales/*.json from disk. Import this (for its side effect) before anything that
// calls setLang() — i18n.test.js, and the tests that load background.js.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setLocaleLoader } from '../../../extension/src/lib/i18n.js';

export const LOCALES_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../../extension/src/lib/locales');

export function readLocale(lang) {
  return JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, `${lang}.json`), 'utf8'));
}

setLocaleLoader(async (lang) => readLocale(lang));
