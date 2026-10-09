// Builds the GitHub Release notes for a version: the version's banner image followed by
// that version's section of CHANGELOG.md.
//
//   node tools/release-notes.mjs 1.5.0 > release-notes.md
//
// The banner is referenced by the TAG's raw URL, so it resolves as soon as the tag exists
// (a `main` URL would 404 for a tag pushed before its branch is merged).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** The body of the `## [version]` section (without its heading), trimmed. */
export function changelogSection(changelog, version) {
  const text = changelog.replace(/\r\n/g, '\n');
  const escaped = version.replace(/\./g, '\\.');
  const heading = new RegExp('^## \\[' + escaped + '\\][^\\n]*\\n', 'm').exec(text);
  if (!heading) throw new Error(`CHANGELOG.md has no [${version}] section`);
  const rest = text.slice(heading.index + heading[0].length);
  const next = rest.search(/^## \[/m);
  return (next < 0 ? rest : rest.slice(0, next)).trim();
}

export function releaseNotes(changelog, version, repo = 'DrummingBird1/timetrack-extension') {
  const banner = `![TimeTrack v${version}](https://raw.githubusercontent.com/${repo}/v${version}/store-assets/promo/releases/v${version}.svg)`;
  return `${banner}\n\n${changelogSection(changelog, version)}\n`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const version = process.argv[2];
  if (!/^\d+\.\d+\.\d+$/.test(version || '')) {
    console.error('usage: node tools/release-notes.mjs <version>');
    process.exit(1);
  }
  process.stdout.write(releaseNotes(fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8'), version, process.env.GITHUB_REPOSITORY || undefined));
}
