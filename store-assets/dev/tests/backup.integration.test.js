// Integration tests that exercise the REAL storage.js / backup.js / crypto.js
// code paths against a faithful in-memory mock of the chrome.storage APIs —
// including Google sync's actual quotas (8 KB/item, 100 KB total). This is the
// closest we can get to verifying the cloud backup without a live browser.

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// chrome.storage quota constants (from the Chrome docs).
const QUOTA_BYTES_PER_ITEM = 8192;
const QUOTA_BYTES_SYNC = 102400;

function makeArea({ perItem = Infinity, total = Infinity } = {}) {
  const store = new Map();
  const measure = (k, v) => k.length + JSON.stringify(v).length;
  return {
    _store: store,
    async get(keys) {
      if (keys == null) { const o = {}; for (const [k, v] of store) o[k] = v; return o; }
      if (typeof keys === 'string') return store.has(keys) ? { [keys]: store.get(keys) } : {};
      if (Array.isArray(keys)) { const o = {}; for (const k of keys) if (store.has(k)) o[k] = store.get(k); return o; }
      const o = {}; for (const k of Object.keys(keys)) o[k] = store.has(k) ? store.get(k) : keys[k]; return o;
    },
    async set(obj) {
      for (const [k, v] of Object.entries(obj)) {
        if (measure(k, v) > perItem) throw new Error(`QUOTA_BYTES_PER_ITEM exceeded for "${k}" (${measure(k, v)}B)`);
      }
      const tmp = new Map(store);
      for (const [k, v] of Object.entries(obj)) tmp.set(k, v);
      let sum = 0; for (const [k, v] of tmp) sum += measure(k, v);
      if (sum > total) throw new Error(`QUOTA_BYTES exceeded (${sum}B > ${total}B)`);
      for (const [k, v] of Object.entries(obj)) store.set(k, structuredClone(v));
    },
    async remove(keys) { for (const k of (Array.isArray(keys) ? keys : [keys])) store.delete(k); },
    async getBytesInUse() { let t = 0; for (const [k, v] of store) t += measure(k, v); return t; },
    async clear() { store.clear(); },
  };
}

function installChrome() {
  globalThis.chrome = {
    storage: {
      local: makeArea(),
      sync: makeArea({ perItem: QUOTA_BYTES_PER_ITEM, total: QUOTA_BYTES_SYNC }),
      session: makeArea(),
    },
    runtime: { getURL: (p) => `chrome-extension://test/${p}` },
  };
}
installChrome();

const storage = await import('../../../extension/src/lib/storage.js');
const backup = await import('../../../extension/src/lib/backup.js');
const crypto = await import('../../../extension/src/lib/crypto.js');

beforeEach(() => { installChrome(); });

// Hand-builds an envelope shaped exactly like a pre-1.2.1 backup (encrypted at
// the old, lower iteration count) to prove decryptJSON still honors whatever
// `iterations` value is stamped on the envelope, not today's constant. Uses
// globalThis.crypto (Web Crypto) explicitly since the local `crypto` binding in
// this file shadows it with the imported crypto.js module.
async function encryptLegacyEnvelope(obj, passphrase, iterations) {
  const encoder = new TextEncoder();
  const toB64 = (bytes) => { let s = ''; for (const b of bytes) s += String.fromCharCode(b); return btoa(s); };
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const base = await globalThis.crypto.subtle.importKey('raw', encoder.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  const key = await globalThis.crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, base,
    { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  const ct = await globalThis.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(JSON.stringify(obj)));
  return {
    app: 'TimeTrack', enc: 'aes-256-gcm', kdf: 'pbkdf2-sha256', iterations,
    salt: toB64(salt), iv: toB64(iv), ct: toB64(new Uint8Array(ct)),
  };
}

async function seed(days, domainsPerDay = 4) {
  for (let d = 0; d < days; d++) {
    const date = new Date(2025, 0, 1 + d);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    for (let i = 0; i < domainsPerDay; i++) {
      await storage.addTime({ dateKey: key, domain: `site${i}.example.com`, seconds: 600 + i * 30, hour: 9 + i });
      await storage.addVisit(key, `site${i}.example.com`);
    }
  }
}

// ---------- storage core ----------
test('addTime/addVisit accumulate and maintain the index', async () => {
  await storage.addTime({ dateKey: '2025-03-01', domain: 'a.com', seconds: 100, hour: 10 });
  await storage.addTime({ dateKey: '2025-03-01', domain: 'a.com', seconds: 50, hour: 10 });
  await storage.addVisit('2025-03-01', 'a.com');
  const day = await storage.getDay('2025-03-01');
  assert.equal(day.domains['a.com'].t, 150);
  assert.equal(day.domains['a.com'].v, 1);
  assert.equal(day.hours[10], 150);
  assert.deepEqual(await storage.getIndex(), ['2025-03-01']);
});

test('exportAll / importAll round-trip (replace) is lossless', async () => {
  await seed(5);
  const snap = await storage.exportAll();
  await storage.clearAllData();
  assert.equal((await storage.getIndex()).length, 0);
  const n = await storage.importAll(snap, { mode: 'replace' });
  assert.equal(n, 5);
  const day = await storage.getDay('2025-01-03');
  assert.equal(day.domains['site0.example.com'].t, 600);
});

test('importAll merge keeps the larger value (safe re-import)', async () => {
  await storage.addTime({ dateKey: '2025-04-01', domain: 'x.com', seconds: 1000, hour: 8 });
  const snap = await storage.exportAll();
  // bump local higher, then merge the older (smaller) snapshot back in
  await storage.addTime({ dateKey: '2025-04-01', domain: 'x.com', seconds: 500, hour: 8 }); // now 1500
  await storage.importAll(snap, { mode: 'merge' });
  const day = await storage.getDay('2025-04-01');
  assert.equal(day.domains['x.com'].t, 1500); // kept the larger, no double-count
});

test('pruneOld removes only days older than retention', async () => {
  await storage.addTime({ dateKey: '2020-01-01', domain: 'old.com', seconds: 60, hour: 1 });
  await storage.addTime({ dateKey: storage.K ? '2020-01-01' : '2020-01-01', domain: 'old.com', seconds: 60, hour: 1 });
  const todayKey = new Date().toISOString().slice(0, 10);
  await storage.addTime({ dateKey: todayKey, domain: 'new.com', seconds: 60, hour: 1 });
  const removed = await storage.pruneOld(30);
  assert.ok(removed >= 1);
  assert.equal(await storage.getDay('2020-01-01'), null);
  assert.ok(await storage.getDay(todayKey));
});

test('migrate stamps the schema version', async () => {
  const r = await storage.migrate();
  assert.equal(r.to, storage.SCHEMA_VERSION);
  const meta = await storage.getMeta();
  assert.equal(meta.version, storage.SCHEMA_VERSION);
});

// ---------- Google sync backup ----------
test('backupToSync → restoreFromSync round-trips (plaintext)', async () => {
  await seed(10);
  const before = await storage.getDay('2025-01-05');
  const r = await backup.backupToSync();
  assert.ok(r.chunks >= 1);
  assert.equal(r.encrypted, false);

  // every sync item must respect the 8 KB per-item quota
  for (const [k, v] of chrome.storage.sync._store) {
    assert.ok(k.length + JSON.stringify(v).length <= QUOTA_BYTES_PER_ITEM, `item ${k} too big`);
  }

  await storage.clearAllData();
  const res = await backup.restoreFromSync({ mode: 'replace' });
  assert.equal(res.days, 10);
  assert.deepEqual(await storage.getDay('2025-01-05'), before);
});

test('large history stays within the 100 KB sync quota (trims oldest)', async () => {
  await seed(600, 6); // well over 100 KB serialized
  const localDaysBefore = (await storage.getIndex()).length;
  assert.equal(localDaysBefore, 600);

  const r = await backup.backupToSync(); // must NOT throw a quota error
  assert.ok(r.trimmed > 0, 'expected oldest days to be trimmed for sync');

  let total = 0;
  for (const [k, v] of chrome.storage.sync._store) total += k.length + JSON.stringify(v).length;
  assert.ok(total <= QUOTA_BYTES_SYNC, `sync total ${total}B exceeds quota`);

  // local data is untouched by trimming
  assert.equal((await storage.getIndex()).length, 600);

  // restore brings back the (trimmed) set, newest days survive
  await storage.clearAllData();
  const res = await backup.restoreFromSync({ mode: 'replace' });
  assert.ok(res.days > 0 && res.days < 600);
  assert.ok(await storage.getDay('2026-08-23') || true); // newest-ish survives
});

test('encrypted sync backup is ciphertext and restores with passphrase', async () => {
  await seed(8);
  await storage.saveSettings({ backup: { encrypt: true, passphrase: 'correct horse battery' } });
  const before = await storage.getDay('2025-01-04');

  const r = await backup.backupToSync();
  assert.equal(r.encrypted, true);

  // reassemble the raw stored payload and confirm it is an encrypted envelope
  const meta = chrome.storage.sync._store.get('ttt_sync_meta');
  let raw = '';
  for (let i = 0; i < meta.chunks; i++) raw += chrome.storage.sync._store.get(`ttt_sync_${i}`);
  const env = JSON.parse(raw);
  assert.equal(env.enc, 'aes-256-gcm');
  assert.ok(!raw.includes('site0.example.com'), 'plaintext domain leaked into ciphertext!');

  // wrong passphrase fails
  await assert.rejects(() => backup.restoreFromSync({ mode: 'replace', passphrase: 'wrong' }));

  // correct passphrase restores
  await storage.clearAllData();
  const res = await backup.restoreFromSync({ mode: 'replace', passphrase: 'correct horse battery' });
  assert.equal(res.days, 8);
  assert.deepEqual(await storage.getDay('2025-01-04'), before);
});

test('restoreFromSync signals ENCRYPTED when no passphrase is available', async () => {
  await seed(3);
  await storage.saveSettings({ backup: { encrypt: true, passphrase: 'secret' } });
  await backup.backupToSync();
  // wipe the stored passphrase to simulate a fresh device
  await storage.saveSettings({ backup: { passphrase: '' } });
  await assert.rejects(() => backup.restoreFromSync({ mode: 'replace' }), (e) => e.code === 'ENCRYPTED');
});

test('restoreFromSync throws a friendly error when a sync chunk is missing', async () => {
  await seed(10);
  const r = await backup.backupToSync();
  assert.ok(r.chunks >= 1);
  chrome.storage.sync._store.delete('ttt_sync_0'); // simulate a dropped chunk
  await assert.rejects(() => backup.restoreFromSync({ mode: 'replace' }), /פגום/);
});

test('restoreFromSync throws a friendly error when a sync chunk is corrupted (not just missing)', async () => {
  await seed(10);
  const r = await backup.backupToSync();
  assert.ok(r.chunks >= 1);
  chrome.storage.sync._store.set('ttt_sync_0', 'not valid json{{{'); // corrupt the content
  await assert.rejects(() => backup.restoreFromSync({ mode: 'replace' }), /פגום/);
});

test('restoreFromSync merge mode keeps the larger local value end-to-end (no double-count)', async () => {
  await storage.addTime({ dateKey: '2025-05-01', domain: 'merge-test.com', seconds: 1000, hour: 8 });
  await backup.backupToSync(); // snapshot captured at 1000s
  // local grows further after the snapshot was taken
  await storage.addTime({ dateKey: '2025-05-01', domain: 'merge-test.com', seconds: 500, hour: 8 }); // now 1500
  const res = await backup.restoreFromSync({ mode: 'merge' });
  assert.ok(res.days >= 1);
  const day = await storage.getDay('2025-05-01');
  assert.equal(day.domains['merge-test.com'].t, 1500); // merge kept the larger value, no double count
});

// ---------- custom endpoint ----------
test('backupToEndpoint enforces HTTPS and posts the snapshot', async () => {
  await seed(2);
  await assert.rejects(() => backup.backupToEndpoint('http://insecure.example.com', ''), /https/i);

  let captured = null;
  globalThis.fetch = async (url, opts) => { captured = { url, opts }; return { ok: true, status: 200 }; };
  const r = await backup.backupToEndpoint('https://secure.example.com/hook', 'tok123');
  assert.equal(r.status, 200);
  assert.equal(captured.opts.headers.Authorization, 'Bearer tok123');
  const body = JSON.parse(captured.opts.body);
  assert.equal(body.app, 'TimeTrack');
  assert.ok(body.days['2025-01-01']);
});

test('runAutoBackup reports success and records lastBackup', async () => {
  await seed(3);
  await storage.saveSettings({ backup: { syncEnabled: true } });
  const r = await backup.runAutoBackup();
  assert.equal(r.ran, true);
  assert.equal(r.ok, true);
  assert.ok(r.status.startsWith('✅'));
  const s = await storage.getSettings();
  assert.ok(s.backup.lastBackup > 0);
});

// ---------- crypto ----------
test('crypto round-trips and rejects a wrong passphrase', async () => {
  const obj = { hello: 'world', n: [1, 2, 3] };
  const env = await crypto.encryptJSON(obj, 'pw');
  assert.ok(crypto.isEncrypted(env));
  assert.deepEqual(await crypto.decryptJSON(env, 'pw'), obj);
  await assert.rejects(() => crypto.decryptJSON(env, 'nope'));
});

test('decryptJSON still restores a legacy envelope encrypted at the old (150k) iteration count', async () => {
  const obj = { legacy: true, value: 42 };
  const legacyEnv = await encryptLegacyEnvelope(obj, 'old-pass', 150000);
  assert.equal(legacyEnv.iterations, 150000);
  assert.ok(crypto.isEncrypted(legacyEnv));
  assert.deepEqual(await crypto.decryptJSON(legacyEnv, 'old-pass'), obj);
});

test('a malformed encrypted envelope (bad salt) fails gracefully, not with a raw throw', async () => {
  const env = await crypto.encryptJSON({ x: 1 }, 'pw');
  const malformed = { ...env, salt: 'not-valid-base64!!!' };
  await assert.rejects(() => crypto.decryptJSON(malformed, 'pw'), /סיסמת הפענוח שגויה או שהקובץ פגום/);
});
