// Dashboard entry point: theme/language, tab routing, range picker and startup.
import { getSettings, saveSettings } from '../lib/storage.js';
import { dayKey, parseDayKey, addDays } from '../lib/utils.js';
import { setLang, getLang, t, dir, localize } from '../lib/i18n.js';
import {
  $, $$, settings, setSettings, setCurrentRange, currentTab, setCurrentTab, siteAllHistory, setSiteAllHistory, setAllCache,
  actions, send, toast, loadRange, closeModal, debounce,
} from './core.js';
import { renderOverview } from './overview.js';
import { renderSites } from './sites.js';
import { renderInsights } from './insights.js';
import { wireCustomCompare } from './compare.js';
import { fillSettingsForm, filterSettings, renderStorageInfo, wireSettings } from './settings.js';

function applyTheme() {
  const mode = settings.theme === 'auto'
    ? (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
    : settings.theme;
  document.documentElement.setAttribute('data-theme', mode);
}

async function applyLanguage() {
  await setLang(settings.language || 'he');
  document.documentElement.lang = getLang();
  document.documentElement.dir = dir();
  localize(document);
  $('#pageTitle').textContent = t(`title.${currentTab}`);
  $('#pageSubtitle').textContent = t(`sub.${currentTab}`);
}

// Guard against a broken-icon state: if the user turned on real favicons but later
// revoked the optional `favicon` permission from Chrome, fall back automatically.
async function ensureFaviconPermission() {
  if (!settings.realFavicons) return;
  try {
    const ok = await chrome.permissions.contains({ permissions: ['favicon'] });
    if (!ok) setSettings(await saveSettings({ realFavicons: false }));
  } catch { /* permissions API edge — keep current setting */ }
}

// ---------------- navigation / refresh ----------------
function switchTab(tab) {
  setCurrentTab(tab);
  $$('.nav-item').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  $$('.tab-panel').forEach((p) => p.classList.toggle('active', p.id === `tab-${tab}`));
  $('#pageTitle').textContent = t(`title.${tab}`);
  $('#pageSubtitle').textContent = t(`sub.${tab}`);
  $('.range-area') && ($('.range-area').style.visibility = tab === 'settings' ? 'hidden' : 'visible');
  renderCurrentTab();
}

function renderCurrentTab() {
  if (currentTab === 'overview') renderOverview();
  else if (currentTab === 'sites') renderSites();
  else if (currentTab === 'insights') renderInsights();
  else if (currentTab === 'settings') fillSettingsForm();
}

function rerenderCharts() {
  if (currentTab !== 'settings') renderCurrentTab();
}

async function refresh() {
  await loadRange();
  renderCurrentTab();
}

async function updateTrackState() {
  const live = await send('getLive');
  const el = $('#trackState');
  if (live.enabled && live.counting && live.currentDomain) {
    el.classList.add('live');
    el.textContent = t('track.watching', { d: live.currentDomain });
  } else if (live.enabled) {
    el.classList.add('live');
    el.textContent = t('track.active');
  } else {
    el.classList.remove('live');
    el.textContent = t('track.paused');
  }
}

// ---------------- init ----------------
async function init() {
  setSettings(await getSettings());
  await ensureFaviconPermission();
  applyTheme();
  await applyLanguage();
  $('#appVersion').textContent = chrome.runtime.getManifest().version;

  $$('.nav-item').forEach((b) => b.addEventListener('click', () => switchTab(b.dataset.tab)));
  $$('#rangePicker button').forEach((b) => b.addEventListener('click', () => {
    $$('#rangePicker button').forEach((x) => x.classList.remove('active'));
    b.classList.add('active');
    if (b.dataset.range === 'custom') {
      $('#customRange').classList.remove('hidden');
      return;
    }
    $('#customRange').classList.add('hidden');
    setCurrentRange(b.dataset.range === 'all' ? 'all' : parseInt(b.dataset.range, 10));
    refresh();
  }));

  // custom range
  $('#rangeTo').value = dayKey();
  $('#rangeFrom').value = dayKey(addDays(new Date(), -13));
  $('#rangeApply').addEventListener('click', () => {
    const from = $('#rangeFrom').value ? parseDayKey($('#rangeFrom').value) : addDays(new Date(), -13);
    const to = $('#rangeTo').value ? parseDayKey($('#rangeTo').value) : new Date();
    if (from > to) { toast(t('range.from') + ' > ' + t('range.to'), 'error'); return; }
    setCurrentRange({ from, to });
    refresh();
  });

  $('#siteSearch').addEventListener('input', () => { if (currentTab === 'sites') renderSites(); });
  $('#siteSort').addEventListener('change', () => { if (currentTab === 'sites') renderSites(); });
  $('#siteAllHistory').addEventListener('change', (e) => {
    setSiteAllHistory(e.target.checked);
    if (siteAllHistory) setAllCache(null);    // rebuild a fresh full-history aggregate
    if (currentTab === 'sites') renderSites();
  });
  $('#settingsSearch').addEventListener('input', filterSettings);

  wireSettings();
  wireCustomCompare();

  // modal dismissal
  $('#siteModal').addEventListener('click', (e) => { if (e.target.id === 'siteModal') closeModal(); });
  $('#welcomeModal').addEventListener('click', (e) => { if (e.target.id === 'welcomeModal') closeModal(); });
  $('#restoreModal').addEventListener('click', (e) => { if (e.target.id === 'restoreModal') closeModal(); });
  $('#welcomeCta').addEventListener('click', closeModal);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

  await send('flush');
  await loadRange();

  if (location.hash === '#settings') switchTab('settings');
  else switchTab('overview');
  if (location.hash === '#welcome') $('#welcomeModal').classList.remove('hidden');

  updateTrackState();
  setInterval(updateTrackState, 30000);

  matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
    if (settings.theme === 'auto') { applyTheme(); rerenderCharts(); }
  });
  window.addEventListener('resize', debounce(() => rerenderCharts(), 200));
}

Object.assign(actions, {
  refresh, rerenderCharts, applyLanguage, applyTheme, updateTrackState, fillSettingsForm, renderStorageInfo,
});

init();
