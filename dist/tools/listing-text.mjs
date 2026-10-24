// Writes one copy-ready plain-text file per language from the detailed descriptions in
// store-assets/STORE_LISTING.md (the source of truth), into store-assets/listing-text/.
//
//   node dist/tools/listing-text.mjs
//
// The Store's description box is plain text, so the Markdown blockquote markers go away and
// hard-wrapped lines are joined back into one line per paragraph and per bullet.
// docs.test.js regenerates these in memory and fails when the files on disk are stale.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const outDir = path.join(root, 'store-assets/listing-text');

const LANG_OF = { English: 'en', 'עברית': 'he', 'العربية': 'ar', 'Русский': 'ru', 'Español': 'es', 'Français': 'fr' };

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

/** { en, he, ar, ru, es, fr } → plain-text description, read from STORE_LISTING.md's text. */
export function buildListingTexts(markdown) {
  const text = markdown.replace(/\r\n/g, '\n');
  const start = text.indexOf('### Detailed description');
  if (start < 0) throw new Error('STORE_LISTING.md has no "### Detailed description" section');
  const section = text.slice(start, text.indexOf('\n---', start));
  const parts = section.split(/^\*\*(.+)\*\*$/m).slice(1);
  const texts = {};
  for (let i = 0; i < parts.length; i += 2) {
    const lang = LANG_OF[parts[i]];
    if (!lang) throw new Error(`unknown language heading "${parts[i]}"`);
    texts[lang] = toPlain(parts[i + 1]);
  }
  return texts;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const texts = buildListingTexts(fs.readFileSync(path.join(root, 'store-assets/STORE_LISTING.md'), 'utf8'));
  fs.mkdirSync(outDir, { recursive: true });
  for (const [lang, body] of Object.entries(texts)) {
    fs.writeFileSync(path.join(outDir, `description-${lang}.txt`), body);
    console.log(`description-${lang}.txt  ${[...body].length} characters`);
  }
}
