import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { changelogSection, releaseNotes } from '../tools/release-notes.mjs';

const sample = `# Changelog\n\nIntro.\n\n## [2.0.0] — 2026-10-10\n\nBig release.\n\n### Added\n- thing\n\n## [1.4.0] — 2026-08-27\n\nOlder.\n\n## [1.3.0]\n\nOldest.\n`;

test('changelogSection returns exactly one version, without its heading or the next one', () => {
  assert.equal(changelogSection(sample, '2.0.0'), 'Big release.\n\n### Added\n- thing');
  assert.equal(changelogSection(sample, '1.4.0'), 'Older.');
  assert.equal(changelogSection(sample, '1.3.0'), 'Oldest.', 'the last section runs to the end');
  assert.equal(changelogSection(sample.replace(/\n/g, '\r\n'), '1.4.0'), 'Older.', 'CRLF files work');
});

test('a missing version is an error, not an empty release', () => {
  assert.throws(() => changelogSection(sample, '9.9.9'), /no \[9\.9\.9\] section/);
  assert.throws(() => changelogSection(sample, '2.0'), /no \[2\.0\] section/);
});

test('release notes start with the tag-pinned banner image', () => {
  const notes = releaseNotes(sample, '2.0.0', 'me/repo');
  assert.ok(notes.startsWith('![TimeTrack v2.0.0](https://raw.githubusercontent.com/me/repo/v2.0.0/store-assets/promo/releases/v2.0.0.svg)\n\nBig release.'));
});

test('the real CHANGELOG yields notes for the current manifest version', () => {
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const { version } = JSON.parse(fs.readFileSync(path.join(root, 'extension/manifest.json'), 'utf8'));
  const notes = releaseNotes(fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8'), version);
  assert.ok(notes.length > 200, 'the release has real notes');
});
