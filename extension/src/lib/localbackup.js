// Scheduled backup to a folder on this computer. The folder is chosen once with the browser's
// directory picker (File System Access API), so no extra extension permission is needed; the
// handle is kept in IndexedDB, which the service worker can read. Chrome may ask the user to
// re-allow access to the folder from time to time — then the backup waits (NEEDS_PERMISSION)
// until the Settings screen grants it again with a click.

const DB_NAME = 'ttt_local_backup';
const STORE = 'handles';
const KEY = 'folder';
export const BACKUP_FILE = /^timetrack-backup-\d{4}-\d{2}-\d{2}-\d{4}\.json$/;

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idb(mode, run) {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = run(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req && req.result);
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export const saveFolderHandle = (handle) => idb('readwrite', (s) => s.put(handle, KEY));
export const loadFolderHandle = () => idb('readonly', (s) => s.get(KEY));
export const clearFolderHandle = () => idb('readwrite', (s) => s.delete(KEY));

/** 'granted' | 'prompt' | 'denied' | 'none' (no folder chosen). */
export async function folderPermission(handle) {
  if (!handle) return 'none';
  try {
    return await handle.queryPermission({ mode: 'readwrite' });
  } catch {
    return 'denied';
  }
}

/** Ask for access again. Must be called from a click. Returns the new permission state. */
export async function requestFolderPermission(handle) {
  try {
    return await handle.requestPermission({ mode: 'readwrite' });
  } catch {
    return 'denied';
  }
}

const pad = (n) => String(n).padStart(2, '0');

/** timetrack-backup-2026-11-20-1405.json (local time). */
export function backupFileName(date = new Date()) {
  return `timetrack-backup-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}.json`;
}

/**
 * Write one backup file into the folder and delete the oldest backups beyond `keep`.
 * Only files named like our own backups are ever listed for deletion.
 * @param {any} dir  a FileSystemDirectoryHandle (or anything with the same methods)
 * @returns {Promise<{ name: string, removed: number }>}
 */
export async function writeBackupToFolder(dir, json, { keep = 7, now = new Date() } = {}) {
  const name = backupFileName(now);
  const file = await dir.getFileHandle(name, { create: true });
  const writable = await file.createWritable();
  try {
    await writable.write(json);
  } finally {
    await writable.close();
  }
  const names = [];
  for await (const [entryName, entry] of dir.entries()) {
    if (entry.kind === 'file' && BACKUP_FILE.test(entryName)) names.push(entryName);
  }
  names.sort().reverse();                                   // newest first (the name sorts by time)
  const stale = names.slice(Math.max(1, keep));
  for (const old of stale) await dir.removeEntry(old);
  return { name, removed: stale.length };
}
