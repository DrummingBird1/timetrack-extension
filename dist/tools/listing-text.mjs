// Writes the English store description as a copy-ready plain-text file from the "Detailed description"
// in store-assets/STORE_LISTING.md (the primary text, in English), into store-assets/listing-text/.
//
//   node dist/tools/listing-text.mjs
//
// Every other language is its own hand-edited file by language code (description-he.txt, -ar, -ru, -es, -fr),
// kept to the same structure as the English one; readListingTexts() loads all six so the tests can compare them.
//
// The Store's description box is plain text, so the Markdown blockquote markers go away and
// hard-wrapped lines are joined back into one line per paragraph and per bullet.
// docs.test.js regenerates the English file in memory and fails when it is stale.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const outDir = path.join(root, 'store-assets/listing-text');

export const LANGS = ['en', 'he', 'ar', 'ru', 'es', 'fr'];

/** One "> "-quoted block → plain text: no markers, one line per paragraph / bullet. */
function toPlain(block) {
  const out = [];
  for (const raw of block.split('\n').filter((l) => l.startsWith('>'))) {
    const line = raw.replace(/^> ?/, '').trimEnd();
    const prev = out[out.length - 1];
    if (!line.trim()) out.push('');
    else if (prev && !line.startsWith('• ')) {
      // A wrapped continuation. A trailing hyphen can't be joined safely ("privacy-" + "first").
      if (prev.endsWith('-')) throw new Error(`ambiguous line wrap after a hyphen: "${prev.slice(-30)}" — rewrap the source`);
      out[out.length - 1] = `${prev} ${line.trim()}`;
    } else out.push(line);
  }
  return `${out.join('\n').trim()}\n`;
}

/** The English plain-text description, read from STORE_LISTING.md's text. */
export function buildEnglishListingText(markdown) {
  const text = markdown.replace(/\r\n/g, '\n');
  const start = text.indexOf('### Detailed description');
  if (start < 0) throw new Error('STORE_LISTING.md has no "### Detailed description" section');
  const section = text.slice(start, text.indexOf('\n---', start));
  const parts = section.split(/^\*\*(.+)\*\*$/m).slice(1);
  if (parts[0] !== 'English' || parts.length !== 2) throw new Error('the "Detailed description" section must hold exactly one block, "**English**"');
  return toPlain(parts[1]);
}

/** { en, he, ar, ru, es, fr } → the plain-text description files as they are on disk. */
export function readListingTexts() {
  return Object.fromEntries(LANGS.map((lang) => [lang, fs.readFileSync(path.join(outDir, `description-${lang}.txt`), 'utf8').replace(/\r\n/g, '\n')]));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const body = buildEnglishListingText(fs.readFileSync(path.join(root, 'store-assets/STORE_LISTING.md'), 'utf8'));
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'description-en.txt'), body);
  console.log(`description-en.txt  ${[...body].length} characters`);
  console.log('The other languages are hand-edited: description-<lang>.txt for he, ar, ru, es, fr.');
}
