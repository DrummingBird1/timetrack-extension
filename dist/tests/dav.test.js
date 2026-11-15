// WebDAV backup target with version history, against an in-memory fake server (global fetch is replaced).
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { installChrome } from './helpers/chrome-storage-mock.js';

installChrome();
await import('./helpers/node-locales.js');
await (await import('../../extension/src/lib/i18n.js')).setLang('he');
const storage = await import('../../extension/src/lib/storage.js');
const backup = await import('../../extension/src/lib/backup.js');

const BASE = 'https://dav.example/files/tt/';
const realFetch = globalThis.fetch;
let files;      // name -> body
let calls;      // [{ method, url, auth }]
let failDelete;

function installFakeServer() {
  files = new Map();
  calls = [];
  failDelete = false;
  globalThis.fetch = async (url, init = {}) => {
    const method = init.method || 'GET';
    calls.push({ method, url, auth: init.headers && init.headers.Authorization });
    const name = decodeURIComponent(url.slice(BASE.length));
    if (method === 'PUT') { files.set(name, init.body); return { ok: true, status: 201, text: async () => '' }; }
    if (method === 'GET') {
      return files.has(name) ? { ok: true, status: 200, text: async () => files.get(name) } : { ok: false, status: 404, text: async () => '' };
    }
    if (method === 'DELETE') {
      if (failDelete) return { ok: false, status: 500, text: async () => '' };
      files.delete(name);
      return { ok: true, status: 204, text: async () => '' };
    }
    if (method === 'PROPFIND') {
      const hrefs = ['/files/tt/', ...[...files.keys()].map((n) => `/files/tt/${encodeURIComponent(n)}`), '/files/tt/..%2f..%2fetc%2fpasswd', '/files/tt/other.json'];
      const xml = `<?xml version="1.0"?><d:multistatus xmlns:d="DAV:">${hrefs.map((h) => `<d:response><d:href>${h}</d:href></d:response>`).join('')}</d:multistatus>`;
      return { ok: true, status: 207, text: async () => xml };
    }
    throw new Error(`unexpected ${method}`);
  };
}

beforeEach(async () => {
  installChrome();
  installFakeServer();
  await storage.addTime({ dateKey: '2026-03-01', domain: 'a.com', seconds: 600, hour: 9 });
  await storage.saveSettings({ backup: { davUrl: BASE, davUser: 'idan', davPassword: 'p@ss', davKeep: 2 } });
});
afterEach(() => { globalThis.fetch = realFetch; });

test('the listing parser trusts only our own backup file names', () => {
  const xml = '<D:href>/x/timetrack-backup-2026-03-01-0800.json</D:href><href>/x/..%2fevil.json</href><d:href>/x/timetrack-backup-2026-03-02-0800.json</d:href><d:href>/x/notes.txt</d:href>';
  assert.deepEqual(backup.parseDavListing(xml), ['timetrack-backup-2026-03-02-0800.json', 'timetrack-backup-2026-03-01-0800.json']);
});

test('a backup is a new file with Basic auth, and the oldest versions beyond davKeep are deleted', async () => {
  files.set('timetrack-backup-2026-01-01-0800.json', '{}');
  files.set('timetrack-backup-2026-01-02-0800.json', '{}');
  const r = await backup.backupToDav();
  assert.match(r.name, /^timetrack-backup-\d{4}-\d{2}-\d{2}-\d{4}\.json$/);
  assert.equal(r.removed, 1);
  assert.deepEqual([...files.keys()].sort(), ['timetrack-backup-2026-01-02-0800.json', r.name].sort());
  const put = calls.find((c) => c.method === 'PUT');
  assert.equal(put.auth, `Basic ${Buffer.from('idan:p@ss').toString('base64')}`);
  assert.ok(!calls.some((c) => c.url.includes('passwd')), 'a hostile listing entry is never requested');
  assert.equal(JSON.parse(files.get(r.name)).app, 'TimeTrack');
});

test('a failed cleanup does not fail the backup', async () => {
  files.set('timetrack-backup-2026-01-01-0800.json', '{}');
  files.set('timetrack-backup-2026-01-02-0800.json', '{}');
  failDelete = true;
  const r = await backup.backupToDav();
  assert.equal(r.removed, 0);
  assert.ok(files.has(r.name));
});

test('versions are listed newest first and a chosen one is downloaded and restorable', async () => {
  await backup.backupToDav();
  const [name] = await backup.listDavVersions();
  const snapshot = await backup.fetchDavVersion(name);
  assert.equal(snapshot.days['2026-03-01'].domains['a.com'].t, 600);
  await assert.rejects(() => backup.fetchDavVersion('../etc/passwd'), /לא תקין/);
});

test('encrypted versions need the passphrase and the secret fields never reach the server', async () => {
  await storage.saveSettings({ backup: { encrypt: true, passphrase: 'correct horse battery' } });
  const r = await backup.backupToDav();
  const body = files.get(r.name);
  assert.ok(!body.includes('p@ss') && !body.includes('correct horse') && !body.includes('a.com'), 'ciphertext only');
  await storage.saveSettings({ backup: { passphrase: '' } });
  await assert.rejects(() => backup.fetchDavVersion(r.name), (e) => e.code === 'ENCRYPTED');
  const snap = await backup.fetchDavVersion(r.name, { passphrase: 'correct horse battery' });
  assert.equal(snap.days['2026-03-01'].domains['a.com'].t, 600);
  assert.equal((await storage.exportAll()).settings.backup.davPassword, '', 'exports never carry the WebDAV password');
});

test('only https folders without embedded credentials are accepted', async () => {
  for (const [url, re] of [['http://dav.example/x/', /https/], ['https://user:pw@dav.example/x/', /שם משתמש/], ['', /WebDAV/]]) {
    await storage.saveSettings({ backup: { davUrl: url } });
    await assert.rejects(() => backup.backupToDav(), re, url);
  }
  assert.equal(calls.length, 0, 'nothing is sent for a rejected address');
});

test('runAutoBackup includes the WebDAV target and reports it', async () => {
  const r = await backup.runAutoBackup({ force: true });
  assert.equal(r.ran, true);
  assert.equal(r.ok, true);
  assert.match(r.status, /WebDAV|שרת/);
});

// ---- stale-backup warning (pure part) ----
test('backupStaleDays: counts from the last success (or install), only for a configured target, and honours the switch', () => {
  const day = 86_400_000;
  const now = 100 * day;
  const base = { backupWarnDays: 7, backup: { endpointUrl: 'https://x.example/', lastBackup: now - 9 * day } };
  assert.equal(backup.backupStaleDays(base, 0, now), 9);
  assert.equal(backup.backupStaleDays({ ...base, backup: { ...base.backup, lastBackup: now - 6 * day } }, 0, now), 0, 'not overdue yet');
  assert.equal(backup.backupStaleDays({ ...base, backup: { ...base.backup, lastBackup: 0 } }, now - 8 * day, now), 8, 'never succeeded: counts from install');
  assert.equal(backup.backupStaleDays({ ...base, backup: { lastBackup: now - 30 * day } }, 0, now), 0, 'no target configured, nothing to warn about');
  assert.equal(backup.backupStaleDays({ ...base, backupWarnDays: 0 }, 0, now), 0, 'switched off');
});
