// Cloud backup against Chrome's REAL chrome.storage.sync quotas (8,192 B per item, 102,400 B total,
// measured on the stored JSON form). The Node mocks model those limits; this proves it in the browser,
// through the same message the dashboard and the hourly alarm use.
//
// What this cannot prove: that Google then propagates the items to another signed-in device — that
// needs a signed-in profile on two machines. Here sync storage is Chrome's local sync area.

import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { launch } from './harness.mjs';
import { buildSnapshot } from '../tools/fixture.mjs';

const PASS = 'a-reasonably-long-passphrase';
let ext;
let snapshot;
before(async () => {
  ext = await launch();
  snapshot = buildSnapshot({ days: 1095, seed: 7, endDate: new Date(2026, 5, 1) });
});
after(async () => { await ext?.close(); });
beforeEach(async () => { await ext.reset(); });

const storageUrl = () => `${ext.base}src/lib/storage.js`;
const syncUsage = () => ext.run(async () => {
  const all = await chrome.storage.sync.get(null);
  const sizes = Object.entries(all).map(([k, v]) => new TextEncoder().encode(k + JSON.stringify(v)).length);
  return { items: sizes.length, largest: Math.max(...sizes), total: sizes.reduce((a, b) => a + b, 0), reported: await chrome.storage.sync.getBytesInUse(null) };
});

for (const encrypt of [false, true]) {
  test(`${encrypt ? 'encrypted' : 'plaintext'} backup of 3 years fits the real sync quotas, keeps the newest days, and restores them exactly`, async (t) => {
    const totalDays = Object.keys(snapshot.days).length;
    await ext.seed(snapshot);
    await ext.saveSettings({ backup: { syncEnabled: true, ...(encrypt ? { encrypt: true, passphrase: PASS } : {}) } });

    const t0 = Date.now();
    const result = await ext.message('runBackup');                // the path the dashboard button and the alarm take
    const ms = Date.now() - t0;
    assert.equal(result.ok, true, result.status);

    const meta = await ext.run(async () => (await chrome.storage.sync.get('ttt_sync_meta')).ttt_sync_meta);
    const usage = await syncUsage();
    t.diagnostic(`${totalDays} days → kept ${meta.days} (trimmed ${meta.trimmed}), ${meta.chunks} chunks, ${usage.total} B of 102400 in sync, ${ms} ms`);
    assert.ok(usage.largest <= 8192, `largest item ${usage.largest} B`);
    assert.ok(usage.total <= 102400, `total ${usage.total} B`);
    assert.ok(usage.reported <= 102400 && usage.reported > 0, `Chrome reports ${usage.reported} B in use`);
    assert.equal(meta.gzip, true);
    assert.equal(meta.encrypted, encrypt);
    assert.ok(meta.days >= 300, `only ${meta.days} of ${totalDays} days kept — the uncompressed format kept ~80`);
    assert.equal(meta.days + meta.trimmed, totalDays);
    assert.ok(ms < 15000, `backup took ${ms} ms`);

    const raw = await ext.run(async () => JSON.stringify(await chrome.storage.sync.get(null)));
    assert.ok(!raw.includes(PASS), 'the passphrase never reaches chrome.storage.sync');
    if (encrypt) assert.ok(!raw.includes('github.com'), 'domains are not readable in an encrypted backup');

    // New device: nothing local (and, for the encrypted case, no passphrase) → restore from the cloud copy.
    await ext.run(async (url) => (await import(url)).clearAllData(), storageUrl());
    if (encrypt) await ext.saveSettings({ backup: { passphrase: '' } });
    const restored = await ext.run(async (url, pass) => {
      const b = await import(url);
      const peek = await b.peekSync({ passphrase: pass });
      const res = await b.restoreFromSync({ mode: 'replace', passphrase: pass });
      const s = await import(url.replace('backup.js', 'storage.js'));
      const idx = await s.getIndex();
      return { peek, res, first: idx[0], last: idx[idx.length - 1], mid: await s.getDay(idx[Math.floor(idx.length / 2)]), midKey: idx[Math.floor(idx.length / 2)], count: idx.length };
    }, `${ext.base}src/lib/backup.js`, encrypt ? PASS : undefined);

    assert.equal(restored.peek.encrypted, encrypt);
    assert.equal(restored.peek.dayCount, meta.days);
    assert.equal(restored.res.days, meta.days);
    assert.equal(restored.count, meta.days);
    assert.equal(restored.last, '2026-06-01', 'the newest day survives');
    assert.deepEqual(restored.mid, snapshot.days[restored.midKey], 'a restored day is identical to the original');
    assert.deepEqual(ext.errors, []);
  });
}

test('a smaller backup after a bigger one leaves no stale chunks behind in real sync storage', async () => {
  await ext.seed(snapshot);
  await ext.saveSettings({ backup: { syncEnabled: true } });
  assert.equal((await ext.message('runBackup')).ok, true);
  const big = await syncUsage();

  await ext.run(async (url) => (await import(url)).clearAllData(), storageUrl());
  await ext.seed(buildSnapshot({ days: 20, seed: 3, endDate: new Date(2026, 5, 1) }));
  assert.equal((await ext.message('runBackup')).ok, true);
  const small = await syncUsage();
  assert.ok(small.items < big.items && small.total < big.total / 4, `${big.items} items/${big.total} B → ${small.items} items/${small.total} B`);
  const meta = await ext.run(async () => (await chrome.storage.sync.get('ttt_sync_meta')).ttt_sync_meta);
  assert.equal(small.items, meta.chunks + 1, 'exactly the chunks the meta names, plus the meta itself');
});

test('real Chrome refuses a quota-busting write without touching the previous backup', async () => {
  await ext.seed(buildSnapshot({ days: 30, seed: 3, endDate: new Date(2026, 5, 1) }));
  await ext.saveSettings({ backup: { syncEnabled: true } });
  assert.equal((await ext.message('runBackup')).ok, true);
  const before = await ext.run(async () => JSON.stringify(await chrome.storage.sync.get(null)));

  // an oversized item (a different extension bug, a future change…) must fail loudly and leave the backup alone
  const error = await ext.run(async () => {
    try { await chrome.storage.sync.set({ ttt_sync_99: 'x'.repeat(9000) }); return null; } catch (e) { return e.message; }
  });
  assert.match(error, /quota/i);
  const after = await ext.run(async () => { await chrome.storage.sync.remove('ttt_sync_99'); return JSON.stringify(await chrome.storage.sync.get(null)); });
  assert.equal(after, before);
});
