// Backup v2 (2.0): checksums travel with every export, a backup can be verified without
// restoring it, and a restore can be limited to a date range or to the settings.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { installChrome } from './helpers/chrome-storage-mock.js';

installChrome();
const storage = await import('../../extension/src/lib/storage.js');
const { verifySnapshot, describeIntegrity, canonicalJSON, filterSnapshotRange } = await import('../../extension/src/lib/integrity.js');

beforeEach(() => { installChrome(); });

async function seedThree() {
  await storage.addTime({ dateKey: '2026-03-01', domain: 'a.com', seconds: 600, hour: 9 });
  await storage.addTime({ dateKey: '2026-03-05', domain: 'b.com', seconds: 300, hour: 10 });
  await storage.addTime({ dateKey: '2026-03-10', domain: 'a.com', seconds: 100, hour: 11 });
}

test('canonicalJSON ignores key order', () => {
  assert.equal(canonicalJSON({ b: 1, a: { d: 2, c: [3, { z: 1, y: 2 }] } }), canonicalJSON({ a: { c: [3, { y: 2, z: 1 }], d: 2 }, b: 1 }));
});

test('an export carries a device id and an integrity block that verifies', async () => {
  await seedThree();
  const snap = await storage.exportAll();
  assert.match(snap.device, /^[0-9a-f-]{36}$/);
  assert.equal(snap.integrity.days, 3);
  assert.equal(snap.integrity.seconds, 1000);
  const again = await storage.exportAll();
  assert.equal(again.device, snap.device, 'the id is stable for this install');
  const r = await verifySnapshot(JSON.parse(JSON.stringify(snap)), storage.DEFAULT_SETTINGS);
  assert.deepEqual({ ok: r.ok, checksum: r.checksum, days: r.days, dropped: r.dropped }, { ok: true, checksum: 'match', days: 3, dropped: 0 });
});

test('verifySnapshot catches a tampered backup, flags old ones without a checksum, and rejects non-backups', async () => {
  await seedThree();
  const snap = JSON.parse(JSON.stringify(await storage.exportAll()));
  snap.days['2026-03-05'].domains['b.com'].t = 999;
  const bad = await verifySnapshot(snap, storage.DEFAULT_SETTINGS);
  assert.equal(bad.ok, false);
  assert.equal(bad.checksum, 'mismatch');

  const old = JSON.parse(JSON.stringify(await storage.exportAll()));
  delete old.integrity;
  const r = await verifySnapshot(old, storage.DEFAULT_SETTINGS);
  assert.equal(r.checksum, 'none');
  assert.equal(r.ok, true, 'no checksum is not a failure');

  assert.equal((await verifySnapshot({ nope: 1 }, storage.DEFAULT_SETTINGS)).ok, false);
  assert.equal((await verifySnapshot(null, storage.DEFAULT_SETTINGS)).ok, false);
});

test('a malformed record is reported as a problem', async () => {
  await seedThree();
  const snap = JSON.parse(JSON.stringify(await storage.exportAll()));
  snap.days['2026-03-01'].domains['bad host'] = { t: 5, v: 1 };
  snap.integrity = await describeIntegrity(snap.days);
  const r = await verifySnapshot(snap, storage.DEFAULT_SETTINGS);
  assert.equal(r.checksum, 'match');
  assert.equal(r.ok, false);
  assert.ok(r.problems.includes('invalid-records'));
});

test('a range restore brings back only those days and never deletes the others', async () => {
  await seedThree();
  const backup = JSON.parse(JSON.stringify(await storage.exportAll()));
  await storage.clearAllData();
  await storage.addTime({ dateKey: '2026-04-01', domain: 'keep.com', seconds: 60, hour: 9 });
  const part = filterSnapshotRange(backup, { from: '2026-03-02', to: '2026-03-31' });
  assert.deepEqual(Object.keys(part.days), ['2026-03-05', '2026-03-10']);
  assert.equal(part.settings, undefined);
  await storage.importAll(part, { mode: 'merge', includeSettings: false });
  assert.deepEqual(await storage.getIndex(), ['2026-03-05', '2026-03-10', '2026-04-01']);
});

test('importSettingsOnly restores settings but leaves history and this device\'s backup target alone', async () => {
  await seedThree();
  await storage.saveSettings({ dailyGoalMinutes: 90, backup: { endpointUrl: 'https://mine.example/b' } });
  const backup = JSON.parse(JSON.stringify(await storage.exportAll()));
  backup.settings.dailyGoalMinutes = 45;
  backup.settings.backup = { endpointUrl: 'https://evil.example/steal' };
  await storage.addTime({ dateKey: '2026-04-01', domain: 'later.com', seconds: 60, hour: 9 });
  await storage.importSettingsOnly(backup);
  const s = await storage.getSettings();
  assert.equal(s.dailyGoalMinutes, 45);
  assert.equal(s.backup.endpointUrl, 'https://mine.example/b');
  assert.deepEqual(await storage.getIndex(), ['2026-03-01', '2026-03-05', '2026-03-10', '2026-04-01']);
  await assert.rejects(() => storage.importSettingsOnly({ days: {} }), (e) => e.code === 'BAD_SNAPSHOT');
});
