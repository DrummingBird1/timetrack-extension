// Settings: scheduled backup to a folder on this computer (the file part is lib/localbackup.js).
import { saveSettings } from '../lib/storage.js';
import { clamp } from '../lib/utils.js';
import {
  saveFolderHandle, loadFolderHandle, clearFolderHandle, folderPermission, requestFolderPermission,
} from '../lib/localbackup.js';
import { t } from '../lib/i18n.js';
import { $, settings, setSettings, toast, send } from './core.js';

async function persist(patch) {
  setSettings(await saveSettings(patch));
  await send('settingsChanged');
}

export async function renderLocalFolder() {
  $('#setLocalEnabled').checked = !!settings.backup.localEnabled;
  $('#setLocalKeep').value = settings.backup.localKeep || 7;
  const supported = typeof /** @type {any} */ (window).showDirectoryPicker === 'function';
  $('#localPick').disabled = !supported;
  const handle = supported ? await loadFolderHandle().catch(() => null) : null;
  const state = await folderPermission(handle);
  $('#localGrant').classList.toggle('hidden', state !== 'prompt');
  $('#localClear').classList.toggle('hidden', !handle);
  $('#localFolderState').textContent = !supported
    ? t('local.unsupported')
    : !handle
      ? t('local.none')
      : t(state === 'granted' ? 'local.ready' : 'local.needsPermission', { n: handle.name });
}

export function wireLocalFolder() {
  $('#setLocalEnabled').addEventListener('change', async (e) => {
    await persist({ backup: { localEnabled: e.target.checked } });
    if (e.target.checked && !(await loadFolderHandle().catch(() => null))) toast(t('local.pickFirst'), 'error');
    renderLocalFolder();
  });
  $('#setLocalKeep').addEventListener('change', (e) => persist({ backup: { localKeep: clamp(parseInt(e.target.value, 10) || 7, 1, 60) } }));
  $('#localPick').addEventListener('click', async () => {
    try {
      const handle = await /** @type {any} */ (window).showDirectoryPicker({ id: 'timetrack-backup', mode: 'readwrite' });
      await saveFolderHandle(handle);
      await persist({ backup: { localEnabled: true } });
      toast(t('local.chosen', { n: handle.name }), 'success');
    } catch (err) {
      if (err && err.name !== 'AbortError') toast(err.message, 'error');   // closing the picker is not an error
    }
    renderLocalFolder();
  });
  $('#localGrant').addEventListener('click', async () => {
    const handle = await loadFolderHandle().catch(() => null);
    if (handle) await requestFolderPermission(handle);
    renderLocalFolder();
  });
  $('#localClear').addEventListener('click', async () => {
    await clearFolderHandle();
    await persist({ backup: { localEnabled: false } });
    renderLocalFolder();
  });
}
