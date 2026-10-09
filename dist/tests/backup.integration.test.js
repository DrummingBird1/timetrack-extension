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

const storage = await import('../../extension/src/lib/storage.js');
const backup = await import('../../extension/src/lib/backup.js');
const crypto = await import('../../extension/src/lib/crypto.js');

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
  const r = await storage.importAll(snap, { mode: 'replace' });
  assert.equal(r.days, 5);
  assert.equal(r.domainsChanged, null, 'replace mode has no conflict-count concept');
  const day = await storage.getDay('2025-01-03');
  assert.equal(day.domains['site0.example.com'].t, 600);
});

test('importAll merge keeps the larger value and reports how many domain-days actually changed', async () => {
  await storage.addTime({ dateKey: '2025-04-01', domain: 'x.com', seconds: 1000, hour: 8 });
  const snap = await storage.exportAll(); // snapshot: 04-01 x.com=1000
  await storage.clearAllData();
  // Local now has a SMALLER value on the day the snapshot covers (merge should
  // pick up the snapshot's larger value -> counts as changed), plus a day the
  // snapshot doesn't cover at all (must be left untouched and not counted).
  await storage.addTime({ dateKey: '2025-04-01', domain: 'x.com', seconds: 300, hour: 8 });
  await storage.addTime({ dateKey: '2025-04-02', domain: 'x.com', seconds: 700, hour: 8 });

  const r = await storage.importAll(snap, { mode: 'merge' });
  assert.equal(r.days, 1); // snap only covers 04-01
  assert.equal(r.domainsChanged, 1, 'x.com on 04-01 grew from the local 300 to the snapshot value 1000');
  const day01 = await storage.getDay('2025-04-01');
  assert.equal(day01.domains['x.com'].t, 1000); // merge picked up the larger snapshot value
  const day02 = await storage.getDay('2025-04-02');
  assert.equal(day02.domains['x.com'].t, 700); // untouched — the snapshot never covered this day

  // Re-importing the SAME snapshot again is now a true no-op (nothing left to grow).
  const r2 = await storage.importAll(snap, { mode: 'merge' });
  assert.equal(r2.domainsChanged, 0, 're-importing an already-merged snapshot changes nothing');
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

test('summarizeSnapshot reports day range, total time, and site count', () => {
  const snap = { days: {
    '2025-05-01': { domains: { 'a.com': { t: 100, v: 1 }, 'b.com': { t: 50, v: 1 } }, hours: new Array(24).fill(0) },
    '2025-05-03': { domains: { 'a.com': { t: 200, v: 1 } }, hours: new Array(24).fill(0) },
  } };
  const s = storage.summarizeSnapshot(snap);
  assert.deepEqual(s, { dayCount: 2, firstDay: '2025-05-01', lastDay: '2025-05-03', totalSeconds: 350, siteCount: 2 });
  assert.deepEqual(storage.summarizeSnapshot({ days: {} }), { dayCount: 0, firstDay: null, lastDay: null, totalSeconds: 0, siteCount: 0 });
});

// ---------- map settings (deepMerge can add/overwrite keys but never delete them) ----------
test('map settings are edited with set/removeSettingsMapEntry, and removal really deletes', async () => {
  await storage.setSettingsMapEntry('categoryMap', 'a.com', 'social');
  await storage.setSettingsMapEntry('categoryMap', 'b.com', 'news');
  let s = await storage.getSettings();
  assert.deepEqual(s.categoryMap, { 'a.com': 'social', 'b.com': 'news' });

  s = await storage.removeSettingsMapEntry('categoryMap', 'a.com');
  assert.ok(!('a.com' in s.categoryMap), 'a.com should be gone from storage, not just from the returned object');
  assert.equal(s.categoryMap['b.com'], 'news', 'other keys are preserved');
  assert.ok(!('a.com' in (await storage.getSettings()).categoryMap), 'and it stays gone after a fresh read');

  await storage.setSettingsMapEntry('siteLimits', 'x.com', 30);
  assert.equal((await storage.removeSettingsMapEntry('siteLimits', 'x.com')).siteLimits['x.com'], undefined);
  assert.equal((await storage.removeSettingsMapEntry('siteLimits', 'never-set.com')).siteLimits['never-set.com'], undefined, 'removing a missing key is a no-op');
});

test('batch helpers set and remove many map entries in one go', async () => {
  const many = Object.fromEntries(Array.from({ length: 500 }, (_, i) => [`site${i}.com`, 'news']));
  let s = await storage.setSettingsMapEntries('categoryMap', many);
  assert.equal(Object.keys(s.categoryMap).length, 500);
  s = await storage.removeSettingsMapEntries('categoryMap', ['site0.com', 'site1.com', 'not-there.com']);
  assert.equal(Object.keys(s.categoryMap).length, 498);
  assert.ok(!('site0.com' in (await storage.getSettings()).categoryMap));
  await storage.removeSettingsMapEntries('categoryMap', Object.keys(many));
  assert.deepEqual((await storage.getSettings()).categoryMap, {});
});

test('saveSettings refuses map settings, so the deepMerge deletion bug cannot be reintroduced', async () => {
  await assert.rejects(() => storage.saveSettings({ categoryMap: { 'a.com': 'news' } }), /categoryMap.*removeSettingsMapEntry/s);
  await assert.rejects(() => storage.saveSettings({ siteLimits: {} }), /siteLimits/);
  await assert.rejects(() => storage.setSettingsMapEntry('notAMap', 'k', 1), /not a map setting/);
  await storage.saveSettings({ blacklist: ['ok.com'] });   // other keys are unaffected
});

test('concurrent settings writes do not overwrite each other (read-modify-write is serialized)', async () => {
  await Promise.all([
    storage.saveSettings({ theme: 'dark' }),
    storage.saveSettings({ idleSeconds: 90 }),
    storage.saveSettings({ focus: { cycles: 3 } }),
    storage.saveSettings({ backup: { autoIntervalHours: 6 } }),
    storage.setSettingsMapEntry('categoryMap', 'p.com', 'news'),
    storage.setSettingsMapEntry('siteLimits', 'q.com', 15),
    storage.saveSettings({ weekStart: 1 }),
  ]);
  const s = await storage.getSettings();
  assert.equal(s.theme, 'dark');
  assert.equal(s.idleSeconds, 90);
  assert.equal(s.focus.cycles, 3);
  assert.equal(s.backup.autoIntervalHours, 6);
  assert.equal(s.categoryMap['p.com'], 'news');
  assert.equal(s.siteLimits['q.com'], 15);
  assert.equal(s.weekStart, 1);
});

// ---------- domain alias-merge ----------
test('mergeDomainAlias sums (not max-merges) two distinct domains across the full history and removes the old one', async () => {
  await storage.addTime({ dateKey: '2025-06-01', domain: 'old-brand.com', seconds: 300, hour: 9 });
  await storage.addVisit('2025-06-01', 'old-brand.com');
  await storage.addTime({ dateKey: '2025-06-01', domain: 'new-brand.com', seconds: 100, hour: 10 });
  await storage.addVisit('2025-06-01', 'new-brand.com');
  await storage.addTime({ dateKey: '2025-06-02', domain: 'old-brand.com', seconds: 50, hour: 8 });
  await storage.setSettingsMapEntry('categoryMap', 'old-brand.com', 'productivity');
  await storage.setSettingsMapEntry('siteLimits', 'old-brand.com', 30);
  await storage.saveSettings({ blacklist: ['unrelated.com'] });

  const touched = await storage.mergeDomainAlias('old-brand.com', 'new-brand.com');
  assert.equal(touched, 2); // 06-01 and 06-02 both had old-brand.com

  const day1 = await storage.getDay('2025-06-01');
  assert.equal(day1.domains['new-brand.com'].t, 400); // 300 + 100, summed not maxed
  assert.equal(day1.domains['new-brand.com'].v, 2);    // 1 + 1
  assert.ok(!('old-brand.com' in day1.domains), 'old domain removed');
  const day2 = await storage.getDay('2025-06-02');
  assert.equal(day2.domains['new-brand.com'].t, 50); // old-brand.com's only entry that day
  assert.ok(!('old-brand.com' in day2.domains));

  const settings = await storage.getSettings();
  assert.equal(settings.categoryMap['new-brand.com'], 'productivity');
  assert.ok(!('old-brand.com' in settings.categoryMap));
  assert.equal(settings.siteLimits['new-brand.com'], 30);
  assert.ok(!('old-brand.com' in settings.siteLimits));
});

test('mergeDomainAlias is a no-op for missing/identical/empty domains', async () => {
  assert.equal(await storage.mergeDomainAlias('', 'x.com'), 0);
  assert.equal(await storage.mergeDomainAlias('x.com', 'x.com'), 0);
  assert.equal(await storage.mergeDomainAlias('never-existed.com', 'x.com'), 0);
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
  // Distinct values per day so it does not compress to nothing: 3 years of realistic browsing.
  const snapshot = buildSnapshot({ days: 1100, seed: 5, endDate: new Date(2026, 5, 1) });
  const dayCount = Object.keys(snapshot.days).length;      // the fixture skips days with no activity
  await storage.importAll(snapshot, { mode: 'replace', includeSettings: false });
  assert.equal((await storage.getIndex()).length, dayCount);

  const r = await backup.backupToSync(); // must NOT throw a quota error
  assert.ok(r.trimmed > 0, 'expected oldest days to be trimmed for sync');
  assert.equal(r.days + r.trimmed, dayCount);

  let total = 0;
  for (const [k, v] of chrome.storage.sync._store) total += k.length + JSON.stringify(v).length;
  assert.ok(total <= QUOTA_BYTES_SYNC, `sync total ${total}B exceeds quota`);

  // local data is untouched by trimming
  assert.equal((await storage.getIndex()).length, dayCount);

  // restore brings back the (trimmed) set, and it is the NEWEST days that survive
  await storage.clearAllData();
  const res = await backup.restoreFromSync({ mode: 'replace' });
  assert.equal(res.days, r.days);
  assert.ok(res.days > 0 && res.days < dayCount);
  const index = await storage.getIndex();
  assert.equal(index[index.length - 1], '2026-06-01');
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

test('peekSync previews a plaintext backup without importing it', async () => {
  await seed(4);
  await backup.backupToSync();
  const before = (await storage.getIndex()).length;

  const preview = await backup.peekSync();
  assert.equal(preview.dayCount, 4);
  assert.equal(preview.firstDay, '2025-01-01');
  assert.equal(preview.lastDay, '2025-01-04');
  assert.equal(preview.siteCount, 4); // seed() uses 4 domains/day by default
  assert.equal(preview.encrypted, false);
  assert.ok(preview.totalSeconds > 0);

  // peeking must not have imported anything
  assert.equal((await storage.getIndex()).length, before);
});

test('peekSync reports encrypted:true without needing to fully restore, and still needs a passphrase', async () => {
  await seed(2);
  await storage.saveSettings({ backup: { encrypt: true, passphrase: 'peekaboo' } });
  await backup.backupToSync();
  await storage.saveSettings({ backup: { passphrase: '' } }); // simulate a fresh device

  await assert.rejects(() => backup.peekSync(), (e) => e.code === 'ENCRYPTED');
  const preview = await backup.peekSync({ passphrase: 'peekaboo' });
  assert.equal(preview.encrypted, true);
  assert.equal(preview.dayCount, 2);
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

// ---------- secrets never leave the device inside a snapshot ----------
test('exportAll never includes the backup passphrase or endpoint token', async () => {
  await seed(2);
  await storage.saveSettings({ backup: { encrypt: true, passphrase: 'correct horse battery', endpointToken: 'tok_secret_123', endpointUrl: 'https://example.com/x' } });
  const snap = await storage.exportAll();
  const text = JSON.stringify(snap);
  assert.ok(!text.includes('correct horse battery'), 'passphrase leaked into the export');
  assert.ok(!text.includes('tok_secret_123'), 'endpoint token leaked into the export');
  assert.equal(snap.settings.backup.endpointUrl, 'https://example.com/x', 'non-secret backup settings must still be exported');
});

test('a plaintext cloud backup does not contain the passphrase either', async () => {
  await seed(2);
  // encrypt is OFF but a passphrase is still stored — the old code leaked it in the clear.
  await storage.saveSettings({ backup: { encrypt: false, passphrase: 'leftover-passphrase' } });
  await backup.backupToSync();
  const all = await chrome.storage.sync.get(null);
  assert.ok(!JSON.stringify(all).includes('leftover-passphrase'), 'passphrase leaked into chrome.storage.sync');
});

test('restoring a snapshot keeps this device\'s local passphrase and endpoint token', async () => {
  await seed(2);
  await storage.saveSettings({ backup: { encrypt: true, passphrase: 'local-pass', endpointToken: 'local-token' } });
  const snap = await storage.exportAll(); // secrets stripped
  await storage.importAll(snap, { mode: 'replace' });
  const s = await storage.getSettings();
  assert.equal(s.backup.passphrase, 'local-pass');
  assert.equal(s.backup.endpointToken, 'local-token');
  assert.equal(s.backup.encrypt, true);
});

test('restoring "encrypt: on" onto a device with no passphrase turns encryption off instead of silently skipping it', async () => {
  await seed(2);
  await storage.saveSettings({ backup: { encrypt: true, passphrase: 'p' } });
  const snap = await storage.exportAll();
  installChrome(); // a brand-new device: no local passphrase
  await storage.importAll(snap, { mode: 'replace' });
  const s = await storage.getSettings();
  assert.equal(s.backup.passphrase, '');
  assert.equal(s.backup.encrypt, false, 'encrypt must not stay on without a passphrase — the UI would claim protection that is not applied');
});

test('an old snapshot that still carries secrets can be restored (backward compatible)', async () => {
  const legacy = { app: 'TimeTrack', version: 2, days: {}, settings: { backup: { encrypt: true, passphrase: 'old-pass', endpointToken: 'old-token' } } };
  await storage.importAll(legacy, { mode: 'merge' });
  const s = await storage.getSettings();
  assert.equal(s.backup.passphrase, 'old-pass');
  assert.equal(s.backup.endpointToken, 'old-token');
});

// ---------- realistic data: the quota maths must count JSON escaping ----------
// chrome.storage.sync measures key + JSON.stringify(value). Every `"` in a chunk of
// serialized JSON becomes `\"`, so a chunk of N characters can cost far more than N
// bytes. Hand-rolled test data had too few quotes to notice; real histories (lots of
// quoted domain / hour keys) blow the 8 KB per-item limit in a real browser.
const { buildSnapshot } = await import('../tools/fixture.mjs');

for (const encrypt of [false, true]) {
  test(`cloud backup of a realistic 1-year history fits the sync quotas (${encrypt ? 'encrypted' : 'plaintext'})`, async () => {
    await storage.importAll(buildSnapshot({ days: 365, seed: 11, endDate: new Date(2026, 5, 1) }), { mode: 'replace', includeSettings: false });
    if (encrypt) await storage.saveSettings({ backup: { encrypt: true, passphrase: 'a-reasonably-long-passphrase' } });
    const localBefore = (await storage.getIndex()).length;

    const r = await backup.backupToSync();           // must not throw a per-item / total quota error
    assert.ok(r.chunks >= 1);
    assert.equal((await storage.getIndex()).length, localBefore, 'local history untouched');

    const all = await chrome.storage.sync.get(null);
    let total = 0;
    for (const [k, v] of Object.entries(all)) {
      const size = k.length + JSON.stringify(v).length;
      assert.ok(size <= QUOTA_BYTES_PER_ITEM, `item ${k} is ${size}B, over the ${QUOTA_BYTES_PER_ITEM}B per-item quota`);
      total += size;
    }
    assert.ok(total <= QUOTA_BYTES_SYNC, `sync total ${total}B over the ${QUOTA_BYTES_SYNC}B quota`);

    // and it must restore: the newest days survive, nothing is corrupted by the chunking
    const peek = await backup.peekSync();
    assert.ok(peek.dayCount > 30, `only ${peek.dayCount} days survived`);
    assert.equal(peek.lastDay, '2026-06-01');
  });
}

test('a non-ASCII history chunks by UTF-8 bytes, not characters', async () => {
  const days = {};
  for (let d = 1; d <= 28; d++) {
    const key = `2026-02-${String(d).padStart(2, '0')}`;
    const domains = {};
    for (let i = 0; i < 40; i++) domains[`אתר-מספר-${i}.example.co.il`] = { t: 100 + i, v: 1, dh: { 9: 100 + i } };
    days[key] = { domains, hours: new Array(24).fill(0) };
  }
  await storage.importAll({ app: 'TimeTrack', version: 2, days }, { mode: 'replace', includeSettings: false });
  await backup.backupToSync();
  for (const [k, v] of Object.entries(await chrome.storage.sync.get(null))) {
    const bytes = new TextEncoder().encode(k + JSON.stringify(v)).length;
    assert.ok(bytes <= QUOTA_BYTES_PER_ITEM, `${k} is ${bytes} UTF-8 bytes`);
  }
});

// ---------- compressed sync backups ----------
// The sync copy is gzip-compressed (and, when enabled, encrypted AFTER compressing — ciphertext does
// not compress). Real histories keep ~4-5x more days than the uncompressed format did.
const syncMetaAndRaw = () => {
  const meta = chrome.storage.sync._store.get('ttt_sync_meta');
  let raw = '';
  for (let i = 0; i < meta.chunks; i++) raw += chrome.storage.sync._store.get(`ttt_sync_${i}`);
  return { meta, raw };
};

for (const encrypt of [false, true]) {
  test(`compressed sync backup keeps over a year of a realistic history and restores it exactly (${encrypt ? 'encrypted' : 'plaintext'})`, async () => {
    const snapshot = buildSnapshot({ days: 1031, seed: 7, endDate: new Date(2026, 5, 1) });
    await storage.importAll(snapshot, { mode: 'replace', includeSettings: false });
    if (encrypt) await storage.saveSettings({ backup: { encrypt: true, passphrase: 'a-reasonably-long-passphrase' } });

    const r = await backup.backupToSync();
    // Before compression this kept only ~80 of these 1,031 days.
    const total = Object.keys(snapshot.days).length;
    assert.ok(total > 900);
    assert.ok(r.days >= 300, `only ${r.days} of ${total} days fit`);
    assert.equal(r.days + r.trimmed, total);
    assert.ok(r.bytes < r.rawBytes / 2, `payload ${r.bytes}B vs raw ${r.rawBytes}B — compression did nothing`);

    const { meta, raw } = syncMetaAndRaw();
    assert.equal(meta.gzip, true);
    assert.equal(meta.days, r.days);
    assert.equal(typeof meta.sha, 'string');
    const stored = JSON.parse(raw);
    if (encrypt) { assert.equal(stored.enc, 'aes-256-gcm'); assert.equal(stored.zip, 'gzip'); assert.ok(!raw.includes('example')); }
    else assert.equal(stored.zip, 'gzip');

    // wipe the device and restore: every surviving day must be exactly what was backed up
    await storage.clearAllData();
    if (encrypt) await storage.saveSettings({ backup: { passphrase: '' } });   // a fresh device: passphrase typed in at restore
    const res = await backup.restoreFromSync({ mode: 'replace', passphrase: encrypt ? 'a-reasonably-long-passphrase' : undefined });
    assert.equal(res.days, r.days);
    const index = await storage.getIndex();
    assert.equal(index.length, r.days);
    assert.equal(index[index.length - 1], '2026-06-01');
    for (const key of [index[0], index[Math.floor(index.length / 2)], index[index.length - 1]]) {
      assert.deepEqual(await storage.getDay(key), snapshot.days[key], `${key} came back different`);
    }
  });
}

test('a one-year history is no longer trimmed at all', async () => {
  const snapshot = buildSnapshot({ days: 365, seed: 11, endDate: new Date(2026, 5, 1) });
  await storage.importAll(snapshot, { mode: 'replace', includeSettings: false });
  const r = await backup.backupToSync();
  assert.equal(r.trimmed, 0);
  assert.equal((await backup.peekSync()).dayCount, Object.keys(snapshot.days).length);
});

test('backups written by older versions (uncompressed plain / encrypted) still restore', async () => {
  await seed(6);
  const snapshot = await storage.exportAll({ sessions: false });
  const before = await storage.getDay('2025-01-03');
  const writeLegacy = async (payload) => {
    chrome.storage.sync._store.clear();
    const chunks = JSON.stringify(payload).match(/[\s\S]{1,3000}/g);
    chunks.forEach((c, i) => chrome.storage.sync._store.set(`ttt_sync_${i}`, c));
    // the old meta had no gzip / sha fields
    chrome.storage.sync._store.set('ttt_sync_meta', { chunks: chunks.length, ts: 1, trimmed: 0, encrypted: !!payload.enc });
  };

  await writeLegacy(snapshot);
  await storage.clearAllData();
  assert.equal((await backup.restoreFromSync({ mode: 'replace' })).days, 6);
  assert.deepEqual(await storage.getDay('2025-01-03'), before);

  await writeLegacy(await crypto.encryptJSON(snapshot, 'old-passphrase'));     // no `zip` field
  await storage.clearAllData();
  assert.equal((await backup.restoreFromSync({ mode: 'replace', passphrase: 'old-passphrase' })).days, 6);
  assert.deepEqual(await storage.getDay('2025-01-03'), before);
});

test('a restore that catches a half-synced backup (chunks from two different backups) fails with a friendly retry message', async () => {
  await storage.importAll(buildSnapshot({ days: 365, seed: 11, endDate: new Date(2026, 5, 1) }), { mode: 'replace', includeSettings: false });
  await backup.backupToSync();
  const first = new Map(chrome.storage.sync._store);
  await storage.addTime({ dateKey: '2026-06-01', domain: 'changed.example', seconds: 500, hour: 10 });
  await backup.backupToSync();
  // another device has received the new meta but is still holding the OLD copy of the last chunk
  const lastNew = chrome.storage.sync._store.get('ttt_sync_meta').chunks - 1;
  const lastOld = first.get('ttt_sync_meta').chunks - 1;
  assert.notEqual(first.get(`ttt_sync_${lastOld}`), chrome.storage.sync._store.get(`ttt_sync_${lastNew}`), 'precondition: the two backups differ in their tail');
  chrome.storage.sync._store.set(`ttt_sync_${lastNew}`, first.get(`ttt_sync_${lastOld}`));
  await assert.rejects(() => backup.restoreFromSync({ mode: 'replace' }), /הסנכרון עדיין לא הסתיים|פגום/);
});

test('a failed backup never costs the user the previous one', async () => {
  await seed(5);
  await backup.backupToSync();
  const good = new Map(chrome.storage.sync._store);

  await seed(6);
  const realSet = chrome.storage.sync.set.bind(chrome.storage.sync);
  chrome.storage.sync.set = async () => { throw new Error('MAX_WRITE_OPERATIONS_PER_MINUTE exceeded'); };
  await assert.rejects(() => backup.backupToSync(), /MAX_WRITE_OPERATIONS/);
  chrome.storage.sync.set = realSet;

  assert.deepEqual([...chrome.storage.sync._store], [...good], 'the old backup must be untouched');
  await storage.clearAllData();
  assert.equal((await backup.restoreFromSync({ mode: 'replace' })).days, 5);
});

test('when the old and new copies do not fit the quota together, the old one is released and the backup still succeeds', async () => {
  await seed(5);
  await backup.backupToSync();
  await seed(6);
  const realSet = chrome.storage.sync.set.bind(chrome.storage.sync);
  let calls = 0;
  chrome.storage.sync.set = async (o) => { if (calls++ === 0) throw new Error('QUOTA_BYTES quota exceeded'); return realSet(o); };
  const r = await backup.backupToSync();
  assert.equal(calls, 2);
  assert.equal(r.days, 6);
  assert.equal((await backup.peekSync()).dayCount, 6);
});

test('chunks left over from a bigger earlier backup are removed', async () => {
  await storage.importAll(buildSnapshot({ days: 365, seed: 11, endDate: new Date(2026, 5, 1) }), { mode: 'replace', includeSettings: false });
  const big = await backup.backupToSync();
  await storage.clearAllData();
  await seed(3);
  const small = await backup.backupToSync();
  assert.ok(small.chunks < big.chunks);
  const keys = [...chrome.storage.sync._store.keys()].filter((k) => k.startsWith('ttt_sync_') && k !== 'ttt_sync_meta');
  assert.equal(keys.length, small.chunks, 'stale chunks would waste the sync quota');
});

test('a corrupted compressed payload fails with the friendly "corrupted backup" message', async () => {
  await seed(3);
  await backup.backupToSync();
  const meta = chrome.storage.sync._store.get('ttt_sync_meta');
  delete meta.sha;                                                   // skip the checksum so the decoder is what notices
  const raw = syncMetaAndRaw().raw.replace(/"data":"[^"]{20}/, '"data":"AAAAAAAAAAAAAAAAAAAA');
  chrome.storage.sync._store.set('ttt_sync_0', raw);
  for (let i = 1; i < meta.chunks; i++) chrome.storage.sync._store.delete(`ttt_sync_${i}`);
  meta.chunks = 1;
  await assert.rejects(() => backup.restoreFromSync({ mode: 'replace' }), /פגום/);
});
