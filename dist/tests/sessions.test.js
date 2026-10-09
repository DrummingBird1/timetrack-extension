// Opt-in session log (schema v3): every visit's start time and length, stored per day
// under ttt_sess_<day>. Covers the storage layer (recording, merging contiguous
// segments, pruning, export/import, alias merge, migration) and the pure stats.

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { installChrome } from './helpers/chrome-storage-mock.js';

installChrome();
const storage = await import('../../extension/src/lib/storage.js');
const stats = await import('../../extension/src/lib/stats.js');

beforeEach(() => { installChrome(); });

const DAY = '2026-03-10';

test('recordSession stores [domain, startSec, seconds] per day and keeps visits separate', async () => {
  await storage.recordSession({ dateKey: DAY, domain: 'a.com', startSec: 3600, seconds: 120 });
  await storage.recordSession({ dateKey: DAY, domain: 'b.com', startSec: 3720, seconds: 60 });     // different site → new session
  await storage.recordSession({ dateKey: DAY, domain: 'a.com', startSec: 3780, seconds: 30 });     // back to a → new session
  assert.deepEqual((await storage.getSessions([DAY]))[DAY], [['a.com', 3600, 120], ['b.com', 3720, 60], ['a.com', 3780, 30]]);
});

test('contiguous segments of the same domain extend one session (the 1-minute tick must not split a visit)', async () => {
  await storage.recordSession({ dateKey: DAY, domain: 'a.com', startSec: 1000, seconds: 60 });
  await storage.recordSession({ dateKey: DAY, domain: 'a.com', startSec: 1060, seconds: 60 });     // exactly contiguous
  await storage.recordSession({ dateKey: DAY, domain: 'a.com', startSec: 1122, seconds: 40 });     // 2 s gap: still the same visit
  const [s] = (await storage.getSessions([DAY]))[DAY];
  assert.deepEqual(s, ['a.com', 1000, 162]);
  // a real gap (idle / away) starts a new session
  await storage.recordSession({ dateKey: DAY, domain: 'a.com', startSec: 1400, seconds: 30 });
  assert.equal((await storage.getSessions([DAY]))[DAY].length, 2);
});

test('sessions are independent of the aggregate day record and the day index', async () => {
  await storage.recordSession({ dateKey: DAY, domain: 'a.com', startSec: 10, seconds: 20 });
  assert.deepEqual(await storage.getIndex(), [], 'recording a session does not invent a tracked day');
  assert.deepEqual(await storage.getSessions(['2026-03-11']), {}, 'days without sessions are simply absent');
});

test('pruneOld and clearAllData remove the sessions of the days they remove', async () => {
  for (const key of ['2024-01-01', '2026-03-10']) {
    await storage.addTime({ dateKey: key, domain: 'a.com', seconds: 60, hour: 9 });
    await storage.recordSession({ dateKey: key, domain: 'a.com', startSec: 100, seconds: 60 });
  }
  await storage.pruneOld(365);
  assert.deepEqual(Object.keys(await storage.getSessions(['2024-01-01', '2026-03-10'])), ['2026-03-10']);
  await storage.clearAllData();
  assert.deepEqual(await storage.getSessions(['2026-03-10']), {});
});

test('clearSessions deletes every session log but leaves the tracked time alone', async () => {
  for (const key of ['2026-03-01', '2026-03-02']) {
    await storage.addTime({ dateKey: key, domain: 'a.com', seconds: 60, hour: 9 });
    await storage.recordSession({ dateKey: key, domain: 'a.com', startSec: 100, seconds: 60 });
  }
  assert.equal(await storage.clearSessions(), 2);
  assert.deepEqual(await storage.getSessions(['2026-03-01', '2026-03-02']), {});
  assert.equal((await storage.getIndex()).length, 2);
  assert.equal((await storage.getDay('2026-03-01')).domains['a.com'].t, 60);
});

test('export includes sessions only when asked and when there are any; import restores them idempotently', async () => {
  await storage.addTime({ dateKey: DAY, domain: 'a.com', seconds: 90, hour: 9 });
  assert.equal('sessions' in (await storage.exportAll()), false, 'no sessions recorded → no key');
  await storage.recordSession({ dateKey: DAY, domain: 'a.com', startSec: 100, seconds: 90 });
  assert.equal('sessions' in (await storage.exportAll({ sessions: false })), false, 'sync backups skip them (100 KB quota)');
  const snap = await storage.exportAll();
  assert.deepEqual(snap.sessions[DAY], [['a.com', 100, 90]]);
  assert.equal(snap.version, 3);

  installChrome();                                              // fresh device
  await storage.importAll(snap, { mode: 'replace', includeSettings: false });
  assert.deepEqual((await storage.getSessions([DAY]))[DAY], [['a.com', 100, 90]]);
  await storage.importAll(snap, { mode: 'merge', includeSettings: false });   // re-importing must not double them
  assert.equal((await storage.getSessions([DAY]))[DAY].length, 1);
});

test('replace-import wipes sessions that the snapshot does not contain', async () => {
  await storage.addTime({ dateKey: DAY, domain: 'a.com', seconds: 90, hour: 9 });
  await storage.recordSession({ dateKey: DAY, domain: 'a.com', startSec: 100, seconds: 90 });
  await storage.importAll({ app: 'TimeTrack', version: 2, days: { '2025-01-01': { domains: { 'z.com': { t: 5, v: 1 } }, hours: new Array(24).fill(0) } } },
    { mode: 'replace', includeSettings: false });
  assert.deepEqual(await storage.getSessions([DAY]), {});
});

test('mergeDomainAlias renames the domain inside session logs too', async () => {
  await storage.addTime({ dateKey: DAY, domain: 'old.com', seconds: 60, hour: 9 });
  await storage.recordSession({ dateKey: DAY, domain: 'old.com', startSec: 100, seconds: 60 });
  await storage.recordSession({ dateKey: DAY, domain: 'other.com', startSec: 300, seconds: 10 });
  await storage.mergeDomainAlias('old.com', 'new.com');
  assert.deepEqual((await storage.getSessions([DAY]))[DAY], [['new.com', 100, 60], ['other.com', 300, 10]]);
});

test('migrate() brings a v2 profile to v3 without touching its data', async () => {
  await storage.saveMeta({ version: 2 });
  await storage.addTime({ dateKey: DAY, domain: 'a.com', seconds: 60, hour: 9 });
  const r = await storage.migrate();
  assert.equal(r.from, 2);
  assert.equal(r.to, 3);
  assert.equal((await storage.getMeta()).version, 3);
  assert.equal((await storage.getDay(DAY)).domains['a.com'].t, 60);
  assert.equal((await storage.getSettings()).sessionLog, false, 'opt-in: off by default');
});

// ---- pure stats ----
const sessions = {
  '2026-03-10': [['a.com', 0, 30], ['a.com', 100, 120], ['b.com', 400, 3000], ['a.com', 4000, 400]],
  '2026-03-11': [['a.com', 0, 2000], ['a.com', 5000, 4000]],
};

test('sessionStats buckets, counts, average and longest for one domain', () => {
  const s = stats.sessionStats(sessions, 'a.com');
  assert.equal(s.count, 5);
  assert.equal(s.totalSeconds, 30 + 120 + 400 + 2000 + 4000);
  assert.equal(s.longest, 4000);
  assert.equal(Math.round(s.average), Math.round(s.totalSeconds / 5));
  // buckets: <1m, 1–5m, 5–15m, 15–30m, 30–60m, 60m+
  assert.deepEqual(s.buckets, [1, 1, 1, 0, 1, 1]);
  assert.equal(s.buckets.reduce((a, b) => a + b, 0), s.count);
  assert.equal(stats.SESSION_BUCKET_LABELS.length, s.buckets.length);
});

test('sessionStats for an unknown domain or no data is empty, never NaN', () => {
  assert.deepEqual(stats.sessionStats(sessions, 'nope.com'), { count: 0, totalSeconds: 0, average: 0, longest: 0, buckets: [0, 0, 0, 0, 0, 0] });
  assert.equal(stats.sessionStats({}, 'a.com').count, 0);
  assert.equal(stats.sessionStats(null, 'a.com').count, 0);
});
