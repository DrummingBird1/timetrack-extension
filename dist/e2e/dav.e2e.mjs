// WebDAV backup against a REAL HTTPS server, called by the real extension in Chrome: the browser does
// the CORS preflight, sends the Basic auth header and enforces the same-origin rules, which no Node
// mock can show. The server is local (self-signed certificate, accepted only because this test starts
// Chrome with --ignore-certificate-errors); it speaks just enough WebDAV: PUT, GET, DELETE, PROPFIND.
//
// What this cannot prove: how a particular product (Nextcloud, ownCloud, a reverse proxy) is configured.
// It shows the extension works against a server that allows the cross-origin requests the settings
// text lists, and fails clearly against one that does not.

import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import https from 'node:https';
import { execFileSync } from 'node:child_process';
import { launch } from './harness.mjs';
import { buildSnapshot } from '../tools/fixture.mjs';

const USER = 'idan';
const PASSWORD = 'p@ss word';
const AUTH = `Basic ${Buffer.from(`${USER}:${PASSWORD}`).toString('base64')}`;

let ext;
let server;
let dir;
let port;
let files;          // name -> body
let seen;           // [{ method, path, auth, origin }]
let cors = true;    // false: behave like a server that never heard of CORS

function startServer() {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tt-dav-'));
  const key = path.join(dir, 'key.pem');
  const cert = path.join(dir, 'cert.pem');
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', cert, '-days', '1',
    '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1'], { stdio: 'ignore' });
  server = https.createServer({ key: fs.readFileSync(key), cert: fs.readFileSync(cert) }, (req, res) => {
    const name = decodeURIComponent(req.url.replace(/^\/dav\//, '').split('?')[0]);
    seen.push({ method: req.method, path: req.url, auth: req.headers.authorization, origin: req.headers.origin });
    const headers = cors ? {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'PUT, GET, DELETE, PROPFIND, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type, Depth',
    } : {};
    if (req.method === 'OPTIONS') { res.writeHead(204, headers); return res.end(); }
    if (req.headers.authorization !== AUTH) { res.writeHead(401, headers); return res.end(); }
    if (req.method === 'PUT') {
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => { files.set(name, Buffer.concat(chunks).toString('utf8')); res.writeHead(201, headers); res.end(); });
      return undefined;
    }
    if (req.method === 'GET') {
      if (!files.has(name)) { res.writeHead(404, headers); return res.end(); }
      res.writeHead(200, { ...headers, 'Content-Type': 'application/json' });
      return res.end(files.get(name));
    }
    if (req.method === 'DELETE') { files.delete(name); res.writeHead(204, headers); return res.end(); }
    if (req.method === 'PROPFIND') {
      const hrefs = ['/dav/', ...[...files.keys()].map((n) => `/dav/${encodeURIComponent(n)}`), '/dav/%2e%2e%2fsecret.json'];
      res.writeHead(207, { ...headers, 'Content-Type': 'application/xml' });
      return res.end(`<?xml version="1.0"?><d:multistatus xmlns:d="DAV:">${hrefs.map((h) => `<d:response><d:href>${h}</d:href></d:response>`).join('')}</d:multistatus>`);
    }
    res.writeHead(405, headers);
    return res.end();
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => { port = server.address().port; resolve(); }));
}

before(async () => {
  await startServer();
  ext = await launch({ args: ['--ignore-certificate-errors'] });
});
after(async () => {
  await ext?.close();
  await new Promise((r) => server?.close(r));
  fs.rmSync(dir, { recursive: true, force: true });
});
beforeEach(async () => {
  files = new Map();
  seen = [];
  cors = true;
  await ext.reset();
  await ext.seed(buildSnapshot({ days: 20, seed: 3 }));
  await ext.saveSettings({ language: 'en', backup: { davUrl: `https://localhost:${port}/dav/`, davUser: USER, davPassword: PASSWORD, davKeep: 2,
    // the worker's own hourly auto-backup must not race these tests: pretend one just ran
    lastBackup: Date.now(), autoIntervalHours: 168 } });
});

const backupLib = () => `${ext.base}src/lib/backup.js`;

test('a backup goes out as a new file, through a real CORS preflight, with Basic auth', async () => {
  const result = await ext.message('runBackup');
  assert.equal(result.ok, true, result.status);
  const put = seen.find((s) => s.method === 'PUT');
  assert.ok(put, 'the server received a PUT');
  assert.equal(put.auth, AUTH);
  assert.match(put.origin, /^chrome-extension:\/\//);
  assert.ok(seen.some((s) => s.method === 'OPTIONS'), 'Chrome sent a CORS preflight first');
  const [name] = [...files.keys()];
  assert.match(name, /^timetrack-backup-\d{4}-\d{2}-\d{2}-\d{4}\.json$/);
  const snap = JSON.parse(files.get(name));
  assert.equal(snap.app, 'TimeTrack');
  assert.ok(snap.integrity && snap.integrity.days > 0, 'carries its checksum block');
  assert.equal(JSON.stringify(snap).includes(PASSWORD), false, 'the WebDAV password is not in the backup');
});

test('older versions beyond "keep" are deleted, and a hostile listing entry is never requested', async () => {
  files.set('timetrack-backup-2020-01-01-0800.json', '{}');
  files.set('timetrack-backup-2020-01-02-0800.json', '{}');
  const result = await ext.message('runBackup');
  assert.equal(result.ok, true, result.status);
  assert.equal(files.size, 2, 'keep = 2: the newest two remain');
  assert.ok(!files.has('timetrack-backup-2020-01-01-0800.json'), 'the oldest was removed');
  assert.ok(!seen.some((s) => /secret/.test(s.path)), 'the odd href in the listing was ignored');
});

test('the versions list and a restore from one version work end to end', async () => {
  await ext.message('runBackup');
  const { names, day } = await ext.run(async (url) => {
    const b = await import(url);
    const names = await b.listDavVersions();
    const snap = await b.fetchDavVersion(names[0]);
    return { names, day: Object.keys(snap.days).sort()[0] };
  }, backupLib());
  assert.equal(names.length, 1);
  assert.match(day, /^\d{4}-\d{2}-\d{2}$/);
});

test('a wrong password is reported with the HTTP status, nothing is stored', async () => {
  await ext.saveSettings({ backup: { davPassword: 'wrong' } });
  const result = await ext.message('runBackup');
  assert.equal(result.ok, false);
  assert.match(result.status, /401/);
  assert.equal(files.size, 0);
});

test('a server without CORS headers fails with a clear message instead of hanging', async () => {
  cors = false;
  const result = await ext.message('runBackup');
  assert.equal(result.ok, false);
  assert.match(result.status, /CORS|server|network/i);
  // Not asserted: whether the file reached the server. Chrome caches a successful preflight for a few seconds, so after
  // the earlier tests it may send the PUT anyway and only then refuse to hand the response to the extension. What matters
  // is that the extension reports failure instead of treating an unreadable response as success.
});
