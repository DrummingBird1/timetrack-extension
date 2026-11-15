// Scheduled backup to a folder: file naming, writing and rotation, against a fake directory handle
// (the real File System Access API and IndexedDB only exist in the browser; see local-backup.e2e.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { backupFileName, writeBackupToFolder, BACKUP_FILE } from '../../extension/src/lib/localbackup.js';

function fakeDir(initial = {}) {
  const files = new Map(Object.entries(initial));
  return {
    files,
    async getFileHandle(name) {
      return { async createWritable() { let buf = ''; return { async write(s) { buf += s; }, async close() { files.set(name, buf); } }; } };
    },
    async *entries() { for (const name of [...files.keys()]) yield [name, { kind: 'file' }]; },
    async removeEntry(name) { files.delete(name); },
  };
}

test('file names sort by time and match the pattern that rotation is allowed to delete', () => {
  const a = backupFileName(new Date(2026, 10, 5, 9, 7));
  const b = backupFileName(new Date(2026, 10, 5, 14, 30));
  assert.equal(a, 'timetrack-backup-2026-11-05-0907.json');
  assert.ok(a < b);
  assert.ok(BACKUP_FILE.test(a));
  assert.ok(!BACKUP_FILE.test('notes.json'));
});

test('writes the backup and keeps only the newest N of our own files, never touching other files', async () => {
  const dir = fakeDir({
    'timetrack-backup-2026-11-01-0800.json': '1',
    'timetrack-backup-2026-11-02-0800.json': '2',
    'timetrack-backup-2026-11-03-0800.json': '3',
    'holiday-photos.json': 'keep me',
    'timetrack-backup-old.txt': 'not ours',
  });
  const r = await writeBackupToFolder(dir, '{"x":1}', { keep: 3, now: new Date(2026, 10, 4, 8, 0) });
  assert.equal(r.name, 'timetrack-backup-2026-11-04-0800.json');
  assert.equal(r.removed, 1);
  assert.deepEqual([...dir.files.keys()].sort(), [
    'holiday-photos.json',
    'timetrack-backup-2026-11-02-0800.json',
    'timetrack-backup-2026-11-03-0800.json',
    'timetrack-backup-2026-11-04-0800.json',
    'timetrack-backup-old.txt',
  ]);
  assert.equal(dir.files.get(r.name), '{"x":1}');
});

test('keep is at least 1: the file just written is never deleted', async () => {
  const dir = fakeDir({ 'timetrack-backup-2026-11-01-0800.json': '1' });
  const r = await writeBackupToFolder(dir, '{}', { keep: 0, now: new Date(2026, 10, 2, 8, 0) });
  assert.deepEqual([...dir.files.keys()], ['timetrack-backup-2026-11-02-0800.json']);
  assert.equal(r.removed, 1);
});
