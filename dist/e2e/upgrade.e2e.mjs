// Upgrading a real profile: the 1.7.0 build creates and fills a Chrome profile, the same profile is
// then opened by the current build (same folder, so the same extension id and the same storage), and
// nothing may be lost. Local check: it needs the v1.7.0 tag (CI checks out without tags and skips it).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { launch, waitFor } from './harness.mjs';
import { buildSnapshot } from '../tools/fixture.mjs';

const repo = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '../..');
const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' });
let hasTag = true;
try { git('rev-parse', '--verify', 'v1.7.0'); } catch { hasTag = false; }

test('a 1.7.0 profile opens in the current build with all history, settings and a rollback snapshot', { skip: hasTag ? false : 'the v1.7.0 tag is not available here' }, async () => {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'tt-upgrade-'));
  const extDir = path.join(work, 'ext');
  const profile = path.join(work, 'profile');
  try {
    // 1) the 1.7.0 build, installed into extDir
    fs.mkdirSync(extDir);
    // write the tagged files one by one (git show), so nothing in the repository is touched
    for (const file of git('ls-tree', '-r', '--name-only', 'v1.7.0', 'extension').split(/\r?\n/).filter(Boolean)) {
      const target = path.join(extDir, file.replace(/^extension\//, ''));
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, execFileSync('git', ['show', `v1.7.0:${file}`], { cwd: repo, maxBuffer: 64 * 1024 * 1024 }));
    }

    let ext = await launch({ extPath: extDir, userDataDir: profile });
    const snapshot = buildSnapshot({ days: 120, seed: 11 });
    // a real-looking multi-product history: Gmail, Docs and Search all counted under google.com in 1.7.0
    for (const day of Object.values(snapshot.days)) day.domains['google.com'] = { t: 900, v: 4 };
    await ext.seed(snapshot);
    await ext.saveSettings({ language: 'en', dailyGoalMinutes: 90, blacklist: ['ignored.example'] });
    const before = await ext.run(async (url) => {
      const s = await import(url);
      const meta = await s.getMeta();
      const days = await s.getDays(await s.getIndex());
      let total = 0;
      for (const d of Object.values(days)) for (const r of Object.values(d.domains)) total += r.t;
      return { version: meta.version, days: Object.keys(days).length, total };
    }, `${ext.base}src/lib/storage.js`);
    assert.equal(before.version, 3, 'the 1.7.0 build writes schema v3');
    // 2) the update: the files in the SAME folder become the current build. Chrome cannot re-register the
    //    extension's worker inside this headless session (reload() leaves it blocked), so the current code is
    //    run from a fresh extension page instead: the same migrate() the worker calls at start, over this
    //    profile's real chrome.storage.local, then the current dashboard on top of it.
    fs.rmSync(extDir, { recursive: true, force: true });
    fs.cpSync(path.join(repo, 'extension'), extDir, { recursive: true });
    const ops = await ext.openPage('src/popup/popup.html');      // a new page loads the new modules (the old page keeps its cached ones)
    ext.run = (fn, ...args) => ops.evaluate(fn, ...args);
    try {
      const after = await waitFor(async () => {
        const r = await ext.run(async (url) => {
          const s = await import(url);
          await s.migrate();
          const meta = await s.getMeta();
          if (meta.version !== s.SCHEMA_VERSION) return null;
          const days = await s.getDays(await s.getIndex());
          let total = 0;
          for (const d of Object.values(days)) for (const rec of Object.values(d.domains)) total += rec.t;
          const backup = (await chrome.storage.local.get('ttt_migration_backup')).ttt_migration_backup;
          return { version: meta.version, split: meta.productSplitFrom, days: Object.keys(days).length, total, backupFrom: backup && backup.fromVersion, settings: await s.getSettings() };
        }, `${ext.base}src/lib/storage.js`);
        return r;
      }, { timeout: 20000, message: 'the profile to be migrated' });

      assert.equal(after.version, 4);
      assert.equal(after.days, before.days, 'no day lost');
      assert.equal(after.total, before.total, 'not one second lost');
      assert.equal(after.backupFrom, 3, 'a rollback snapshot of the old data was taken first');
      assert.match(after.split, /^\d{4}-\d{2}-\d{2}$/);
      assert.equal(after.settings.dailyGoalMinutes, 90, 'settings survive');
      assert.deepEqual(after.settings.blacklist, ['ignored.example']);
      assert.deepEqual(after.settings.tags, {}, 'new settings get their defaults');

      // the dashboard opens, explains the product split once, and has no errors
      const page = await ext.openPage('src/dashboard/dashboard.html');
      await page.waitForSelector('#summaryCards .stat-card');
      await page.waitForSelector('#productNote:not(.hidden)');
      await page.click('#productNoteDismiss');
      await page.waitForSelector('#productNote.hidden');
      await page.close();
      assert.deepEqual(ext.errors, [], ext.errors.join('\n'));
    } finally {
      await ext.close();
    }
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
});
