// Adds new UI strings to every language at once, so none can be forgotten.
//
//   node tools/add-strings.mjs new-strings.json [--force]
//
// new-strings.json: { "some.key": { "he": "...", "en": "...", "ar": "...", "ru": "...", "es": "...", "fr": "..." }, ... }
//
// Checks before writing anything: every language present and non-empty, the same
// {placeholder} tokens in all of them, and the key not already taken (--force
// overwrites). Keys are appended, in the order given, to extension/src/lib/locales/*.json.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SUPPORTED_LANGS } from '../../extension/src/lib/i18n.js';

const localesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../extension/src/lib/locales');
const [file] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const force = process.argv.includes('--force');
if (!file) {
  console.error('usage: node tools/add-strings.mjs new-strings.json [--force]');
  process.exit(1);
}

const incoming = JSON.parse(fs.readFileSync(file, 'utf8'));
const dicts = Object.fromEntries(SUPPORTED_LANGS.map((l) => [l, JSON.parse(fs.readFileSync(path.join(localesDir, `${l}.json`), 'utf8'))]));
const placeholders = (s) => [...(s.match(/\{[a-zA-Z]+\}/g) || [])].sort().join(',');

const problems = [];
for (const [key, byLang] of Object.entries(incoming)) {
  if (key in dicts.he && !force) problems.push(`${key}: already exists (use --force to overwrite)`);
  for (const lang of SUPPORTED_LANGS) {
    const text = byLang[lang];
    if (typeof text !== 'string' || !text.trim()) { problems.push(`${key}: missing "${lang}"`); continue; }
    if (byLang.he && placeholders(text) !== placeholders(byLang.he)) {
      problems.push(`${key}: ${lang} has placeholders [${placeholders(text)}] but he has [${placeholders(byLang.he)}]`);
    }
  }
  for (const lang of Object.keys(byLang)) if (!SUPPORTED_LANGS.includes(lang)) problems.push(`${key}: unknown language "${lang}"`);
}
if (problems.length) {
  console.error(`Nothing written — ${problems.length} problem(s):\n  ${problems.join('\n  ')}`);
  process.exit(1);
}

for (const lang of SUPPORTED_LANGS) {
  for (const [key, byLang] of Object.entries(incoming)) dicts[lang][key] = byLang[lang];
  fs.writeFileSync(path.join(localesDir, `${lang}.json`), JSON.stringify(dicts[lang], null, 2) + '\n');
}
console.log(`Added ${Object.keys(incoming).length} string(s) to ${SUPPORTED_LANGS.length} languages.`);
