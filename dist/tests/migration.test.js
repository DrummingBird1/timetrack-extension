// Schema migrations: a snapshot is taken before any transform on existing data, and a failing
// step puts everything back exactly as it was (2.0 foundation — schema v4 depends on this).

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { installChrome } from './helpers/chrome-storage-mock.js';

installChrome();
const storage = await import('../../extension/src/lib/storage.js');

beforeEach(() => { installChrome(); });

const day = { domains: { 'a.com': { t: 600, v: 2 } }, hours: new Array(24).fill(0) };

async function seed(version) {
  await chrome.storage.local.set({
    ttt_meta: { version, firstDay: '2026-01-01', installedAt: 1 },
    ttt_index: ['2026-01-01'],
    'ttt_day_2026-01-01': day,
    ttt_settings: { language: 'he' },
  });
}

test('a fresh install migrates without a snapshot', async () => {
  const r = await storage.migrate();
  assert.equal(r.snapshot, false);
  assert.equal((await chrome.storage.local.get('ttt_migration_backup')).ttt_migration_backup, undefined);
});

test('a failing migration is rolled back and the error is rethrown', async () => {
  await seed(3);
  const migrations = [{
    to: 4,
    run: async () => {
      await chrome.storage.local.set({ 'ttt_day_2026-01-01': { domains: {}, hours: [] }, 'ttt_day_2026-01-02': day });
      throw new Error('boom');
    },
  }];
  await assert.rejects(storage.migrate({ migrations, target: 4 }), /boom/);
  const all = await chrome.storage.local.get(null);
  assert.deepEqual(all['ttt_day_2026-01-01'], day, 'history is back to what it was');
  assert.equal('ttt_day_2026-01-02' in all, false, 'keys added by the failed step are removed');
  assert.equal(all.ttt_meta.version, 3, 'version is not advanced');
});

test('a successful migration keeps the snapshot until it is cleared, and can still be rolled back', async () => {
  await seed(3);
  const migrations = [{ to: 4, run: async () => { await chrome.storage.local.set({ 'ttt_day_2026-01-01': { domains: {}, hours: [] } }); } }];
  const r = await storage.migrate({ migrations, target: 4 });
  assert.equal(r.snapshot, true);
  assert.equal((await chrome.storage.local.get('ttt_meta')).ttt_meta.version, 4);
  assert.equal(await storage.rollbackMigration(), true);
  assert.deepEqual((await chrome.storage.local.get('ttt_day_2026-01-01'))['ttt_day_2026-01-01'], day);
  await storage.clearMigrationBackup();
  assert.equal(await storage.rollbackMigration(), false, 'nothing left to roll back to');
});

test('v3 -> v4 keeps all history as-is, snapshots first and records when the product split began', async () => {
  await seed(3);
  const r = await storage.migrate();
  assert.equal(r.to, 4);
  assert.equal(r.snapshot, true);
  const all = await chrome.storage.local.get(null);
  assert.deepEqual(all['ttt_day_2026-01-01'], day);
  assert.match(all.ttt_meta.productSplitFrom, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(all.ttt_meta.version, 4);
});
