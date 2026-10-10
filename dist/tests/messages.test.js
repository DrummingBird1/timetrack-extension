// The UI <-> service-worker protocol: validation, and a drift guard that keeps the
// declared message list and the worker's switch in step.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MESSAGE_TYPES, parseMessage } from '../../extension/src/lib/messages.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (rel) => fs.readFileSync(path.join(here, '../../extension', rel), 'utf8');

test('parseMessage rejects anything that is not a known request', () => {
  for (const bad of [null, undefined, 42, 'getLive', [], {}, { type: 'rm -rf' }, { type: 'toString' }, { type: 123 }, { kind: 'getLive' }]) {
    assert.equal(parseMessage(bad), null, `accepted ${JSON.stringify(bad)}`);
  }
});

test('parseMessage accepts every declared type and drops unexpected fields', () => {
  for (const type of MESSAGE_TYPES) assert.equal(parseMessage({ type })?.type, type);
  assert.deepEqual(parseMessage({ type: 'getLive', evil: '<script>' }), { type: 'getLive' });
});

test('parseMessage normalizes payloads', () => {
  assert.deepEqual(parseMessage({ type: 'setEnabled', value: 'yes' }), { type: 'setEnabled', value: true });
  assert.deepEqual(parseMessage({ type: 'setEnabled' }), { type: 'setEnabled', value: false });
  assert.equal(parseMessage({ type: 'startFocus', minutes: '25' }).minutes, 25);
  assert.equal(parseMessage({ type: 'startFocus', minutes: -5 }).minutes, undefined);
  assert.equal(parseMessage({ type: 'startFocus', minutes: 'abc' }).minutes, undefined);
  assert.equal(parseMessage({ type: 'startFocus' }).minutes, undefined);
});

test('the worker handles exactly the declared message types (no drift)', () => {
  const bg = read('background.js');
  const body = bg.slice(bg.indexOf('async function handleMessage'), bg.indexOf('async function startFocusSession'));
  const handled = [...body.matchAll(/case '(\w+)':/g)].map((m) => m[1]).filter((t) => t !== 'default');
  assert.deepEqual([...handled].sort(), [...MESSAGE_TYPES].sort());
});

test('every message the UI sends is a declared type', () => {
  const sources = ['src/popup/popup.js', 'src/blocked/blocked.js', 'src/dashboard/core.js', 'src/dashboard/settings.js',
    'src/dashboard/siteDetail.js', 'src/dashboard/sites.js', 'src/dashboard/settingsEditors.js', 'src/dashboard/dashboard.js', 'src/dashboard/dataio.js'];
  const used = new Set();
  for (const file of sources) {
    for (const m of read(file).matchAll(/\b(?:send|msg)\('(\w+)'/g)) used.add(m[1]);
  }
  assert.ok(used.size >= 6, `found only ${used.size} send() call sites`);
  for (const type of used) assert.ok(MESSAGE_TYPES.includes(type), `UI sends undeclared message "${type}"`);
});
