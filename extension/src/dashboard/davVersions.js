// Settings: the WebDAV backup target and its list of stored versions (the file work is in lib/backup.js).
import { saveSettings } from '../lib/storage.js';
import { clamp, esc } from '../lib/utils.js';
import { t } from '../lib/i18n.js';
import { $, settings, setSettings, toast, send } from './core.js';
import { davVersions, restoreDavVersion } from './dataio.js';

async function persist(patch) {
  setSettings(await saveSettings(patch));
  await send('settingsChanged');
}

export function renderDav() {
  const b = settings.backup;
  $('#setDavUrl').value = b.davUrl || '';
  $('#setDavUser').value = b.davUser || '';
  $('#setDavPass').value = b.davPassword || '';
  $('#setDavKeep').value = b.davKeep || 10;
}

/** "timetrack-backup-2026-11-20-1405.json" -> "2026-11-20 14:05" */
function versionLabel(name) {
  const m = /(\d{4}-\d{2}-\d{2})-(\d{2})(\d{2})\.json$/.exec(name);
  return m ? `${m[1]} ${m[2]}:${m[3]}` : name;
}

async function showVersions() {
  let names;
  try {
    names = await davVersions();
  } catch (e) {
    toast(e.message, 'error');
    return;
  }
  const card = $('#restoreModalCard');
  card.innerHTML = `
    <div class="modal-head">
      <h3>${esc(t('dav.title'))}</h3>
      <button class="modal-close" id="restoreModalClose" aria-label="${esc(t('btn.close'))}">✕</button>
    </div>
    ${names.length ? '' : `<p class="set-desc">${esc(t('dav.empty'))}</p>`}
    <div id="davList"></div>`;
  const list = card.querySelector('#davList');
  for (const name of names) {
    const row = document.createElement('div');
    row.className = 'setting-row';
    row.innerHTML = `<div class="set-label">${esc(versionLabel(name))}</div><button class="btn">${esc(t('dav.restore'))}</button>`;
    row.querySelector('button').addEventListener('click', async () => {
      $('#restoreModal').classList.add('hidden');
      try {
        await restoreDavVersion(name);
      } catch (e) {
        toast(e.message, 'error');
      }
    });
    list.appendChild(row);
  }
  $('#restoreModal').setAttribute('aria-label', t('dav.title'));
  $('#restoreModal').classList.remove('hidden');
  $('#restoreModalClose').addEventListener('click', () => $('#restoreModal').classList.add('hidden'));
}

export function wireDav() {
  $('#setDavUrl').addEventListener('change', (e) => persist({ backup: { davUrl: e.target.value.trim() } }));
  $('#setDavUser').addEventListener('change', (e) => persist({ backup: { davUser: e.target.value.trim() } }));
  $('#setDavPass').addEventListener('change', (e) => persist({ backup: { davPassword: e.target.value } }));
  $('#setDavKeep').addEventListener('change', (e) => persist({ backup: { davKeep: clamp(parseInt(e.target.value, 10) || 10, 1, 100) } }));
  $('#davVersions').addEventListener('click', showVersions);
}
