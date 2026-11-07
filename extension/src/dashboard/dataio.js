// Backup restore flow plus file export / import (JSON, CSV).
import { getSettings, getIndex, getDays, exportAll, importAll, getPreReplaceInfo, undoLastReplace } from '../lib/storage.js';
import { restoreFromSync, peekSync } from '../lib/backup.js';
import { isEncrypted, decryptJSON } from '../lib/crypto.js';
import { dayKey, parseDayKey, formatDuration } from '../lib/utils.js';
import { categorize } from '../lib/categories.js';
import { parseUsageCsv } from '../lib/csvimport.js';
import { t, locale } from '../lib/i18n.js';
import { $, settings, setSettings, cache, setAllCache, toast, actions } from './core.js';

// Fetch + decrypt the cloud backup and show a preview (day range, total time,
// site count, encrypted y/n, and a replace/merge choice) before committing.
export async function startRestoreFlow() {
  try {
    showRestorePreview(await peekSync());
  } catch (e) {
    if (e.code !== 'ENCRYPTED') { toast(e.message, 'error'); return; }
    // Encrypted: ask for the passphrase, and ask again when it is wrong (three tries).
    for (let attempt = 0; attempt < 3; attempt++) {
      const pass = prompt(t(attempt ? 'prompt.passphraseRetry' : 'prompt.passphrase'));
      if (!pass) return;
      try {
        showRestorePreview(await peekSync({ passphrase: pass }), pass);
        return;
      } catch (e2) {
        if (e2.code !== 'BAD_PASSPHRASE' || attempt === 2) { toast(e2.message, 'error'); return; }
      }
    }
  }
}

/** Decrypt an encrypted export, asking for the passphrase again (three tries) when it is wrong. Null when cancelled. */
async function decryptWithPrompt(envelope) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const pass = prompt(t(attempt ? 'prompt.passphraseRetry' : 'prompt.passphrase'));
    if (!pass) return null;
    try {
      return await decryptJSON(envelope, pass);
    } catch (e) {
      if (e.code !== 'BAD_PASSPHRASE' || attempt === 2) throw e;
    }
  }
  return null;
}

/** What to tell the user beyond "imported N days": records that were left out, and a retention change. */
function importNotes(r) {
  const notes = [];
  if (r.dropped) notes.push(t('toast.importSkipped', { n: r.dropped }));
  if (r.retentionRelaxed) notes.push(t('toast.retentionKept'));
  return notes.length ? ` ${notes.join(' ')}` : '';
}

const importError = (err) => (err.code === 'BAD_SNAPSHOT' ? t('import.badFile') : err.message);

/** Re-read everything the dashboard shows after the stored data (or the settings in it) changed. */
async function afterDataChange() {
  setAllCache(null);
  setSettings(await getSettings());
  await actions.applyLanguage();
  actions.applyTheme();
  await actions.refresh();
  actions.fillSettingsForm();
}

function showRestorePreview(preview, passphrase) {
  const fmtDay = (k) => k ? parseDayKey(k).toLocaleDateString(locale(), { day: 'numeric', month: 'short' }) : '—';
  const range = preview.dayCount ? `${fmtDay(preview.firstDay)} – ${fmtDay(preview.lastDay)}` : '—';
  const card = $('#restoreModalCard');
  card.innerHTML = `
    <div class="modal-head">
      <h3>${t('restore.previewTitle')}</h3>
      <button class="modal-close" id="restoreModalClose" aria-label="${t('btn.close')}">✕</button>
    </div>
    <div class="detail-stats">
      <div class="detail-stat"><div class="v">${preview.dayCount}</div><div class="l">${t('restore.dayRange')}</div></div>
      <div class="detail-stat"><div class="v">${formatDuration(preview.totalSeconds)}</div><div class="l">${t('restore.totalTime')}</div></div>
      <div class="detail-stat"><div class="v">${preview.siteCount}</div><div class="l">${t('restore.siteCount')}</div></div>
      <div class="detail-stat"><div class="v">${preview.encrypted ? t('restore.yes') : t('restore.no')}</div><div class="l">${t('restore.encrypted')}</div></div>
    </div>
    <div class="detail-section-title">${range}</div>
    <div class="setting-row">
      <div class="set-label">${t('set.import')}</div>
      <select id="restoreModeSelect">
        <option value="replace">${t('import.replace')}</option>
        <option value="merge">${t('import.merge')}</option>
      </select>
    </div>
    <div class="btn-group" style="justify-content:flex-end;margin-top:16px">
      <button class="btn ghost" id="restoreModalCancel">${t('restore.cancelBtn')}</button>
      <button class="btn-primary" id="restoreModalConfirm">${t('restore.confirmBtn')}</button>
    </div>`;
  $('#restoreModal').setAttribute('aria-label', t('restore.previewTitle'));
  $('#restoreModal').classList.remove('hidden');
  $('#restoreModalClose').addEventListener('click', closeRestoreModal);
  $('#restoreModalCancel').addEventListener('click', closeRestoreModal);
  $('#restoreModalConfirm').addEventListener('click', async () => {
    const mode = $('#restoreModeSelect').value;
    closeRestoreModal();
    try {
      await doRestore(passphrase, mode);
    } catch (e) {
      toast(e.message, 'error');
    }
  });
}

function closeRestoreModal() {
  $('#restoreModal').classList.add('hidden');
}

async function doRestore(passphrase, mode = 'replace') {
  const r = await restoreFromSync({ mode, passphrase });
  await afterDataChange();
  const msg = mode === 'merge' && r.domainsChanged != null
    ? t('toast.importedWithChanges', { n: r.days, mode: t('import.merge'), c: r.domainsChanged })
    : t('toast.restored', { n: r.days });
  toast(msg + importNotes(r), 'success');
}

/** Put back the data the last "replace" (import or cloud restore) overwrote. */
export async function undoReplace() {
  const info = await getPreReplaceInfo();
  if (!info) return;
  if (!confirm(t('confirm.undoReplace', { n: info.days }))) return;
  try {
    const r = await undoLastReplace();
    await afterDataChange();
    toast(t('toast.undone', { n: r.days }), 'success');
  } catch (err) {
    toast(t('toast.importErr', { e: importError(err) }), 'error');
  }
}

// ---- export / import ----
async function download(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function exportData() {
  const data = await exportAll();
  await download(`timetrack-backup-${dayKey()}.json`, JSON.stringify(data, null, 2), 'application/json');
  toast(t('toast.exportedJson'), 'success');
}

export async function exportCsv(currentViewOnly) {
  let keys;
  let days;
  if (currentViewOnly) { keys = cache.keys.slice().sort(); days = cache.days; }
  else { keys = (await getIndex()).sort(); days = await getDays(keys); }
  const rows = [['date', 'domain', 'category', 'seconds', 'minutes', 'visits']];
  for (const key of keys) {
    const day = days[key];
    if (!day) continue;
    for (const [domain, rec] of Object.entries(day.domains)) {
      rows.push([key, domain, categorize(domain, settings.categoryMap),
        Math.round(rec.t), (rec.t / 60).toFixed(1), rec.v]);
    }
  }
  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const suffix = currentViewOnly ? 'view' : 'export';
  await download(`timetrack-${suffix}-${dayKey()}.csv`, '﻿' + csv, 'text/csv;charset=utf-8');
  toast(t('toast.exportedCsv'), 'success');
}

export async function handleImport(e) {
  const file = e.target.files[0];
  if (!file) return;
  try {
    let snapshot = JSON.parse(await file.text());
    if (isEncrypted(snapshot)) {
      snapshot = await decryptWithPrompt(snapshot);
      if (!snapshot) { e.target.value = ''; return; }
    }
    const mode = $('#importMode').value;
    const r = await importAll(snapshot, { mode, includeSettings: true });
    await afterDataChange();
    const modeLabel = mode === 'merge' ? t('import.merge') : t('import.replace');
    const msg = mode === 'merge' && r.domainsChanged != null
      ? t('toast.importedWithChanges', { n: r.days, mode: modeLabel, c: r.domainsChanged })
      : t('toast.imported', { n: r.days, mode: modeLabel });
    toast(msg + importNotes(r), 'success');
  } catch (err) {
    toast(t('toast.importErr', { e: err instanceof SyntaxError ? t('import.badFile') : importError(err) }), 'error');
  } finally {
    e.target.value = '';
  }
}

// ---- CSV import (migration path: TimeTrack exports, RescueTime-style exports, any date/site/duration CSV) ----
export async function handleCsvImport(e) {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const { days, skipped } = parseUsageCsv(await file.text());
    const count = Object.keys(days).length;
    const mode = $('#importMode').value;
    const r = await importAll({ app: 'TimeTrack', version: 3, days }, { mode, includeSettings: false });
    await afterDataChange();
    actions.renderStorageInfo();
    toast((skipped ? t('toast.importedCsvSkipped', { n: count, s: skipped }) : t('toast.importedCsv', { n: count })) + importNotes(r), 'success');
  } catch (err) {
    const message = err.code === 'NO_COLUMNS' ? t('csv.badHeader') : err.code === 'NO_ROWS' ? t('csv.noRows') : importError(err);
    toast(t('toast.importErr', { e: message }), 'error');
  } finally {
    e.target.value = '';
  }
}
