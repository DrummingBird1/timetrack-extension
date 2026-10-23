// Documentation that exists in six languages drifts silently unless something checks it.
// These tests fail the build when the READMEs, the marketing site or the release metadata
// fall out of step — the discipline CLAUDE.md asks for, enforced.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8').replace(/\r\n/g, '\n');
const LANGS = ['he', 'en', 'ar', 'ru', 'es', 'fr'];
const README = { en: 'README.md', he: 'README.he.md', ar: 'README.ar.md', ru: 'README.ru.md', es: 'README.es.md', fr: 'README.fr.md' };

// ---------------------------------------------------------------- READMEs
test('all six READMEs link to each other from a language switcher, and mark their own language', () => {
  for (const [lang, file] of Object.entries(README)) {
    const text = read(file);
    const switcher = text.slice(text.indexOf('<p align="center">\n  <a href="README') > -1 ? text.indexOf('<p align="center">\n  <a href="README') : text.indexOf('<b>'));
    for (const [other, otherFile] of Object.entries(README)) {
      if (other === lang) assert.match(switcher, /<b>[^<]+<\/b>/, `${file}: own language is not bolded`);
      else assert.ok(switcher.includes(`href="${otherFile}"`), `${file} does not link to ${otherFile}`);
    }
  }
});

test('all six READMEs have the same structure: sections and feature bullets', () => {
  const shape = (file) => {
    const text = read(file);
    const sections = text.split(/^## /m).slice(1);
    const features = sections[0].split('\n').filter((l) => /^- \*\*/.test(l)).length;
    const subBullets = sections[0].split('\n').filter((l) => /^ {2}- \*\*/.test(l)).length;
    return { sections: sections.length, features, subBullets, codeBlocks: (text.match(/^```/gm) || []).length };
  };
  const reference = shape(README.en);
  for (const [lang, file] of Object.entries(README)) {
    assert.deepEqual(shape(file), reference, `${file} differs in structure from README.md — update all six together`);
  }
});

test('every README mentions the current test setup instead of a stale command', () => {
  for (const file of Object.values(README)) {
    assert.doesNotMatch(read(file), /bnpm test/, `${file} still says "npm test" (the project uses pnpm)`);
  }
});

// ------------------------------------------------------------ marketing site
const site = read('store-assets/site/index.html');

function siteStrings() {
  const start = site.indexOf('var STR = ');
  const end = site.indexOf('\n  };', start);
  assert.ok(start > 0 && end > start, 'could not locate STR in the site');
  return new Function(`return ${site.slice(start + 'var STR = '.length, end + 4)}`)();
}

test('the site has the same translation keys in all six languages', () => {
  const STR = siteStrings();
  assert.deepEqual(Object.keys(STR).sort(), [...LANGS].sort());
  const reference = Object.keys(STR.en).sort();
  for (const lang of LANGS) assert.deepEqual(Object.keys(STR[lang]).sort(), reference, `site STR.${lang} keys differ from en`);
  for (const lang of LANGS) {
    for (const [key, value] of Object.entries(STR[lang])) assert.ok(String(value).trim(), `STR.${lang}.${key} is empty`);
  }
});

test('the privacy policy is present in all six languages with the same shape, and each language is selectable', () => {
  const cards = [...site.matchAll(/<div class="card (?:rtl )?privacy-card" data-lang="(\w+)"[^>]*>([\s\S]*?)\n    <\/div>/g)];
  assert.deepEqual(cards.map((c) => c[1]).sort(), [...LANGS].sort());
  const shape = (html) => ({ headings: (html.match(/<h3>/g) || []).length, bullets: (html.match(/<li>/g) || []).length });
  const en = shape(cards.find((c) => c[1] === 'en')[2]);
  for (const [, lang, html] of cards) assert.deepEqual(shape(html), en, `privacy card "${lang}" differs from the English one`);
  for (const lang of LANGS) assert.ok(site.includes(`<option value="${lang}"`), `no <option> for ${lang} in the language picker`);
});

test('PRIVACY.md lists the same data categories in Hebrew and English', () => {
  const md = read('store-assets/PRIVACY.md');
  const [he, en] = md.split(/^## English/m);
  const bullets = (part) => {
    const section = part.split(/^### /m).find((s) => /אילו נתונים נאספים|What data is collected/.test(s)) || '';
    return section.split('\n').filter((l) => /^- /.test(l)).length;
  };
  assert.ok(bullets(en) >= 4, 'the English "what data is collected" list looks too short');
  assert.equal(bullets(he), bullets(en));
});

// ----------------------------------------------------------------- store listing pack
test('STORE_LISTING.md: short descriptions equal the packaged ones, and all six languages have a detailed description', () => {
  const listing = read('store-assets/STORE_LISTING.md');
  const shortStart = listing.indexOf('### Short description');
  const detailedStart = listing.indexOf('### Detailed description');
  const short = [...listing.slice(shortStart, detailedStart).matchAll(/^- \*\*([A-Z]{2}) \((\d+)\):\*\* (.+)$/gm)];
  assert.deepEqual(short.map((m) => m[1].toLowerCase()).sort(), [...LANGS].sort());
  for (const [, code, count, text] of short) {
    const lang = code.toLowerCase();
    const { appDescription } = JSON.parse(read(`extension/_locales/${lang}/messages.json`));
    assert.equal(text, appDescription.message, `${lang}: STORE_LISTING.md and _locales/${lang}/messages.json disagree on the short description`);
    assert.equal(Number(count), [...text].length, `${lang}: the character count label is wrong`);
  }

  const detailed = listing.slice(detailedStart, listing.indexOf('\n---', detailedStart));
  const blocks = detailed.split(/^\*\*(.+)\*\*$/m).slice(1);
  const byName = Object.fromEntries(blocks.filter((_, i) => i % 2 === 0).map((name, i) => [name, blocks[i * 2 + 1]]));
  assert.deepEqual(Object.keys(byName), ['English', 'עברית', 'العربية', 'Русский', 'Español', 'Français']);
  const bullets = (text) => (text.match(/^> • /gm) || []).length;
  for (const [name, text] of Object.entries(byName)) assert.equal(bullets(text), bullets(byName.English), `${name}: feature bullets differ from the English description`);
});

// -------------------------------------------------------------------- release metadata
test('manifest, CHANGELOG and the release banner agree on the current version', () => {
  const { version } = JSON.parse(read('extension/manifest.json'));
  const changelog = read('CHANGELOG.md');
  assert.match(changelog, new RegExp(`^## \\[${version.replace(/\./g, '\\.')}\\]`, 'm'), `CHANGELOG.md has no [${version}] entry`);
  const top = changelog.match(/^## \[(\d+\.\d+\.\d+)\]/m)[1];
  assert.equal(top, version, 'the newest CHANGELOG entry must be the manifest version');
  assert.ok(fs.existsSync(path.join(root, `store-assets/promo/releases/v${version}.svg`)),
    `missing release banner — run: node dist/make-release-banner.mjs ${version} <theme> "<tagline>"`);
});
