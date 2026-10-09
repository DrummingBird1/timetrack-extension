// Settings tab: form binding, change handlers, search filter, passphrase meter, backup status.
import { saveSettings, getSettings, getIndex, storageFootprint, clearAllData, clearSessions } from '../lib/storage.js';
import { clamp, passphraseStrength } from '../lib/utils.js';
import { t, locale } from '../lib/i18n.js';
import { $, $$, settings, setSettings, setAllCache, toast, send, actions } from './core.js';
import {
  updateFocusModeFields, renderFocusCats, renderFocusDomains, addFocusDomain, renderBlacklist, addBlacklist,
  renderCategoryEditor, addCategoryMapping, renderSchedule, addScheduleEntry,
} from './settingsEditors.js';
import { renderBudgetEditor, wireBudgets } from './budgets.js';
import { startRestoreFlow, exportData, exportCsv, handleImport, handleCsvImport } from './dataio.js';

// ---------------- SETTINGS ----------------
export function fillSettingsForm() {
  $('#setEnabled').checked = settings.enabled;
  $('#setLanguage').value = settings.language;
  $('#setTheme').value = settings.theme;
  $('#setIdle').value = settings.idleSeconds;
  $('#setAudible').checked = settings.countAudibleBackground;
  $('#setGroup').checked = settings.groupSubdomains;
  $('#setWeekStart').value = settings.weekStart;
  $('#setDailyLimit').value = settings.dailyLimitMinutes;
  $('#setDailyGoal').value = settings.dailyGoalMinutes;
  $('#setWeeklyGoal').value = settings.weeklyGoalMinutes;
  $('#setNotify').checked = settings.notifyLimits;
  $('#setWeeklySummary').checked = settings.weeklySummary;
  $('#setRealFavicons').checked = settings.realFavicons;
  $('#setFocusMinutes').value = settings.focus.defaultMinutes;
  $('#setFocusBreak').value = settings.focus.breakMinutes;
  $('#setLongBreak').value = settings.focus.longBreakMinutes;
  $('#setLongBreakEvery').value = settings.focus.longBreakEvery;
  $('#setFocusCycles').value = settings.focus.cycles;
  $('#setFocusMode').value = settings.focus.mode;
  $('#setFocusStrict').checked = settings.focus.strict;
  $('#setSyncEnabled').checked = settings.backup.syncEnabled;
  $('#setBackupInterval').value = settings.backup.autoIntervalHours;
  $('#setEndpoint').value = settings.backup.endpointUrl;
  $('#setEndpointToken').value = settings.backup.endpointToken;
  $('#setEncrypt').checked = settings.backup.encrypt;
  $('#setPassphrase').value = settings.backup.passphrase;
  updatePassStrength(settings.backup.passphrase);
  $('#setRetention').value = settings.retentionDays;
  $('#setSessionLog').checked = settings.sessionLog;
  renderFocusCats('#focusCats', 'blockCategories');
  renderFocusCats('#focusAllowCats', 'allowCategories');
  renderFocusDomains('#focusBlockDomains', 'blockDomains');
  renderFocusDomains('#focusAllowDomains', 'allowDomains');
  updateFocusModeFields();
  renderSchedule();
  renderBackupStatus();
  renderStorageInfo();
  renderCategoryEditor();
  renderBudgetEditor();
  renderBlacklist();
  filterSettings();
}

// Filters the Settings tab by text match: a panel whose header matches stays
// fully visible; otherwise each of its direct children is shown/hidden on its
// own text content, and the whole panel hides if nothing in it matched.
export function filterSettings() {
  const term = $('#settingsSearch').value.trim().toLowerCase();
  const panels = $$('#tab-settings .settings-grid > .panel');
  panels.forEach((panel) => {
    const header = panel.querySelector('.panel-head');
    const headerMatch = !term || (header && header.textContent.toLowerCase().includes(term));
    let anyVisible = false;
    for (const child of panel.children) {
      if (child.classList.contains('panel-head')) continue;
      const show = !term || headerMatch || child.textContent.toLowerCase().includes(term);
      child.classList.toggle('search-hidden', !show);
      if (show) anyVisible = true;
    }
    panel.classList.toggle('search-hidden', !!term && !headerMatch && !anyVisible);
  });
}

function updatePassStrength(pw) {
  const el = $('#passStrength');
  const strength = passphraseStrength(pw);
  el.classList.toggle('hidden', !strength);
  if (!strength) return;
  el.className = `pass-strength ${strength}`;
  $('#passStrengthLabel').textContent = t(`set.passStrength.${strength}`);
}

function renderBackupStatus() {
  const b = settings.backup;
  const last = b.lastBackup ? new Date(b.lastBackup).toLocaleString(locale()) : t('backup.never');
  $('#backupStatus').innerHTML = `${t('backup.last')} <strong>${last}</strong><br>${b.lastBackupStatus || ''}`;
}

export async function renderStorageInfo() {
  const bytes = await storageFootprint();
  const idx = await getIndex();
  $('#storageInfo').textContent = `${(bytes / 1024).toFixed(1)} KB · ${idx.length} ${t('unit.days')}`;
}

async function persist(patch) {
  setSettings(await saveSettings(patch));
  await send('settingsChanged');
}

export function wireSettings() {
  const bindSwitch = (id, key, after) => $(id).addEventListener('change', async (e) => {
    await persist({ [key]: e.target.checked }); after?.();
  });
  bindSwitch('#setEnabled', 'enabled', () => actions.updateTrackState());
  bindSwitch('#setAudible', 'countAudibleBackground');
  bindSwitch('#setGroup', 'groupSubdomains', async () => { await actions.refresh(); });
  bindSwitch('#setNotify', 'notifyLimits');
  bindSwitch('#setWeeklySummary', 'weeklySummary');
  bindSwitch('#setSessionLog', 'sessionLog');
  $('#clearSessions').addEventListener('click', async () => {
    if (!confirm(t('confirm.clearSessions'))) return;
    toast(t('toast.sessionsCleared', { n: await clearSessions() }), 'success');
    renderStorageInfo();
  });

  $('#setLanguage').addEventListener('change', async (e) => {
    await persist({ language: e.target.value });
    await actions.applyLanguage(); fillSettingsForm(); actions.rerenderCharts();
  });
  $('#setTheme').addEventListener('change', async (e) => { await persist({ theme: e.target.value }); actions.applyTheme(); actions.rerenderCharts(); });
  $('#setWeekStart').addEventListener('change', (e) => persist({ weekStart: parseInt(e.target.value, 10) }));
  $('#setIdle').addEventListener('change', (e) => persist({ idleSeconds: clamp(parseInt(e.target.value, 10) || 60, 15, 3600) }));
  $('#setDailyLimit').addEventListener('change', (e) => persist({ dailyLimitMinutes: Math.max(0, parseInt(e.target.value, 10) || 0) }));
  $('#setDailyGoal').addEventListener('change', (e) => { persist({ dailyGoalMinutes: Math.max(0, parseInt(e.target.value, 10) || 0) }); });
  $('#setWeeklyGoal').addEventListener('change', (e) => persist({ weeklyGoalMinutes: Math.max(0, parseInt(e.target.value, 10) || 0) }));
  $('#setFocusMinutes').addEventListener('change', (e) => persist({ focus: { defaultMinutes: clamp(parseInt(e.target.value, 10) || 25, 1, 240) } }));
  $('#setFocusBreak').addEventListener('change', (e) => persist({ focus: { breakMinutes: clamp(parseInt(e.target.value, 10) || 0, 0, 60) } }));
  $('#setFocusCycles').addEventListener('change', (e) => persist({ focus: { cycles: clamp(parseInt(e.target.value, 10) || 1, 1, 12) } }));
  $('#setLongBreak').addEventListener('change', (e) => persist({ focus: { longBreakMinutes: clamp(parseInt(e.target.value, 10) || 0, 0, 120) } }));
  $('#setLongBreakEvery').addEventListener('change', (e) => persist({ focus: { longBreakEvery: clamp(parseInt(e.target.value, 10) || 4, 1, 12) } }));
  $('#setFocusMode').addEventListener('change', async (e) => { await persist({ focus: { mode: e.target.value } }); updateFocusModeFields(); });

  // Focus specific domains (block-list / allow-list beyond categories)
  $('#focusBlockDomainAdd').addEventListener('click', () => addFocusDomain('#focusBlockDomainInput', 'blockDomains', '#focusBlockDomains'));
  $('#focusBlockDomainInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') addFocusDomain('#focusBlockDomainInput', 'blockDomains', '#focusBlockDomains'); });
  $('#focusAllowDomainAdd').addEventListener('click', () => addFocusDomain('#focusAllowDomainInput', 'allowDomains', '#focusAllowDomains'));
  $('#focusAllowDomainInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') addFocusDomain('#focusAllowDomainInput', 'allowDomains', '#focusAllowDomains'); });

  // Real favicons — request the optional `favicon` permission on enable.
  $('#setRealFavicons').addEventListener('change', async (e) => {
    if (e.target.checked) {
      const granted = await chrome.permissions.request({ permissions: ['favicon'] });
      if (!granted) { e.target.checked = false; toast(t('toast.faviconDenied'), 'error'); return; }
      await persist({ realFavicons: true });
      toast(t('toast.faviconGranted'), 'success');
    } else {
      await persist({ realFavicons: false });
      try { await chrome.permissions.remove({ permissions: ['favicon'] }); } catch { /* ignore */ }
    }
    actions.rerenderCharts();
  });

  $('#setRetention').addEventListener('change', async (e) => {
    await persist({ retentionDays: clamp(parseInt(e.target.value, 10) || 365, 7, 3650) });
    const { removed } = await send('prune');
    if (removed) toast(t('toast.pruned', { n: removed }), 'success');
  });

  // Backup
  $('#setSyncEnabled').addEventListener('change', (e) => persist({ backup: { syncEnabled: e.target.checked } }));
  $('#setBackupInterval').addEventListener('change', (e) => persist({ backup: { autoIntervalHours: clamp(parseInt(e.target.value, 10) || 24, 1, 168) } }));
  $('#setEndpoint').addEventListener('change', (e) => {
    const url = e.target.value.trim();
    if (url && !/^https:\/\//i.test(url)) toast(t('toast.needHttps'), 'error');
    persist({ backup: { endpointUrl: url } });
  });
  $('#setEndpointToken').addEventListener('change', (e) => persist({ backup: { endpointToken: e.target.value.trim() } }));
  $('#setEncrypt').addEventListener('change', (e) => {
    if (e.target.checked && !settings.backup.passphrase) toast(t('toast.needPass'), 'error');
    persist({ backup: { encrypt: e.target.checked } });
  });
  $('#setPassphrase').addEventListener('change', (e) => persist({ backup: { passphrase: e.target.value } }));
  $('#setPassphrase').addEventListener('input', (e) => updatePassStrength(e.target.value));

  $('#backupNow').addEventListener('click', async () => {
    toast(t('toast.backingUp'));
    const r = await send('runBackup');
    setSettings(await getSettings());
    renderBackupStatus();
    toast(r?.ran ? t('toast.backupDone') : (r?.status || t('toast.noTarget')), r?.ok === false ? 'error' : 'success');
  });

  $('#restoreSync').addEventListener('click', startRestoreFlow);

  // Export / import
  $('#exportJson').addEventListener('click', () => exportData());
  $('#exportCsv').addEventListener('click', () => exportCsv(false));
  $('#exportView').addEventListener('click', () => exportCsv(true));
  $('#importBtn').addEventListener('click', () => $('#importFile').click());
  $('#importFile').addEventListener('change', handleImport);
  $('#importCsvBtn').addEventListener('click', () => $('#importCsvFile').click());
  $('#importCsvFile').addEventListener('change', handleCsvImport);

  $('#clearData').addEventListener('click', async () => {
    if (!confirm(t('confirm.clear'))) return;
    await clearAllData();
    setAllCache(null);
    await actions.refresh();
    renderStorageInfo();
    toast(t('toast.cleared'), 'success');
  });

  wireBudgets();
  $('#setFocusStrict').addEventListener('change', (e) => persist({ focus: { strict: e.target.checked } }));
  $('#scheduleAdd').addEventListener('click', addScheduleEntry);
  $('#catAdd').addEventListener('click', addCategoryMapping);
  $('#catDomain').addEventListener('keydown', (e) => { if (e.key === 'Enter') addCategoryMapping(); });

  $('#blacklistAdd').addEventListener('click', addBlacklist);
  $('#blacklistDomain').addEventListener('keydown', (e) => { if (e.key === 'Enter') addBlacklist(); });
}
