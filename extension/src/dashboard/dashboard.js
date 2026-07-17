import {
  getSettings, saveSettings, getIndex, getDays, getDay, exportAll, importAll,
  clearAllData, pruneOld, storageFootprint,
} from '../lib/storage.js';
import { restoreFromSync } from '../lib/backup.js';
import { isEncrypted, decryptJSON } from '../lib/crypto.js';
import {
  dayKey, rangeKeys, keysBetween, parseDayKey, addDays, formatDuration, favicon,
  weekdaysShort, weekdaysFull, sum, clamp,
} from '../lib/utils.js';
import {
  aggregateDomains, totalTime, topSites, byCategory, focusScore, dailyTotals,
  weekHourHeatmap, hourlyDistribution, activeDaysCount, currentStreak, trend, busiestHour,
  generateInsights, domainPeakHour, domainHourly,
} from '../lib/stats.js';
import { categorize, CATEGORY_DEFS, CATEGORY_ORDER, categoryDef } from '../lib/categories.js';
import { barChart, donutChart, heatmap } from '../lib/charts.js';
import { setLang, t, dir, locale, localize, categoryLabel } from '../lib/i18n.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

let settings = null;
let currentRange = 7;             // number | 'all' | { from: Date, to: Date }
let currentTab = 'overview';
let cache = { keys: [], days: {}, agg: {} };
let siteAllHistory = false;       // Sites tab: aggregate the whole index, not just the range
let allCache = null;              // lazily-built full-history cache; invalidated on data changes

function send(type, extra = {}) {
  return chrome.runtime.sendMessage({ type, ...extra }).catch(() => ({}));
}

function toast(message, kind = '') {
  const el = $('#toast');
  el.textContent = message;
  el.className = `toast show ${kind}`;
  setTimeout(() => { el.className = 'toast'; }, 2600);
}

function applyTheme() {
  const mode = settings.theme === 'auto'
    ? (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
    : settings.theme;
  document.documentElement.setAttribute('data-theme', mode);
}

function applyLanguage() {
  setLang(settings.language || 'he');
  document.documentElement.lang = settings.language === 'en' ? 'en' : 'he';
  document.documentElement.dir = dir();
  localize(document);
  $('#pageTitle').textContent = t(`title.${currentTab}`);
  $('#pageSubtitle').textContent = t(`sub.${currentTab}`);
}

// Site icon: Chrome's local favicon cache when the user opted in (permission
// granted), otherwise the privacy-safe generated letter avatar.
function iconFor(domain) {
  if (settings.realFavicons) {
    return `${chrome.runtime.getURL('_favicon/')}?pageUrl=${encodeURIComponent('https://' + domain)}&size=32`;
  }
  return favicon(domain);
}

// Normalize free-typed input to a bare registrable-ish domain, or '' if unusable.
function cleanDomain(raw) {
  const d = (raw || '').trim().toLowerCase()
    .replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '');
  return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(d) ? d : '';
}

// Guard against a broken-icon state: if the user turned on real favicons but later
// revoked the optional `favicon` permission from Chrome, fall back automatically.
async function ensureFaviconPermission() {
  if (!settings.realFavicons) return;
  try {
    const ok = await chrome.permissions.contains({ permissions: ['favicon'] });
    if (!ok) settings = await saveSettings({ realFavicons: false });
  } catch { /* permissions API edge — keep current setting */ }
}

// Sites tab reads either the selected range (default) or the full history.
async function sitesSource() {
  if (!siteAllHistory) return cache;
  if (!allCache) {
    const keys = await getIndex();
    const days = await getDays(keys);
    allCache = { keys, days, agg: aggregateDomains(days) };
  }
  return allCache;
}

function productiveTime(cats) {
  return cats.filter((c) => CATEGORY_DEFS[c.key]?.score > 0).reduce((a, c) => a + c.t, 0);
}
function distractingTime(cats) {
  return cats.filter((c) => CATEGORY_DEFS[c.key]?.score < 0).reduce((a, c) => a + c.t, 0);
}

// ---------------- data loading ----------------
function rangeKeyList() {
  if (currentRange === 'all') return null; // resolved against the index
  if (typeof currentRange === 'object') return keysBetween(currentRange.from, currentRange.to);
  return rangeKeys(currentRange);
}

async function loadRange() {
  let keys = rangeKeyList();
  if (keys === null) {
    keys = await getIndex();
    if (!keys.length) keys = [dayKey()];
  }
  const days = await getDays(keys);
  cache = { keys, days, agg: aggregateDomains(days) };
  return cache;
}

function rangeLabel() {
  if (currentRange === 'all') return t('range.all');
  if (typeof currentRange === 'object') {
    const o = { day: 'numeric', month: 'short' };
    return `${currentRange.from.toLocaleDateString(locale(), o)} – ${currentRange.to.toLocaleDateString(locale(), o)}`;
  }
  if (currentRange === 1) return t('range.today');
  return t(`range.${currentRange}`);
}

// ---------------- OVERVIEW ----------------
function statCard({ icon, val, lbl, delta }) {
  const deltaHtml = delta == null ? '' :
    `<div class="delta ${delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat'}">
       ${delta > 0 ? '▲' : delta < 0 ? '▼' : '•'} ${Math.abs(delta)}% ${t('delta.prev')}
     </div>`;
  return `<div class="stat-card">
    <div class="ic">${icon}</div>
    <div class="val">${val}</div>
    <div class="lbl">${lbl}</div>
    ${deltaHtml}
  </div>`;
}

const ICONS = {
  clock: '<svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 100 20 10 10 0 000-20zm1 11h-2V6h2v5l4 2-1 1.7L13 13z"/></svg>',
  cal: '<svg viewBox="0 0 24 24"><path d="M19 4h-1V2h-2v2H8V2H6v2H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V6a2 2 0 00-2-2zm0 16H5V10h14v10z"/></svg>',
  avg: '<svg viewBox="0 0 24 24"><path d="M3 17l6-6 4 4 8-8-1.4-1.4L13 12l-4-4-7.6 7.6z"/></svg>',
  focus: '<svg viewBox="0 0 24 24"><path d="M12 8a4 4 0 100 8 4 4 0 000-8zm0-6v3m0 14v3M2 12h3m14 0h3"/></svg>',
  fire: '<svg viewBox="0 0 24 24"><path d="M13 2s4 4 4 9a5 5 0 01-10 0c0-2 1-3 1-3s0 2 2 2c1 0 1-2 0-4-1-2 3-4 3-6zM9 16a3 3 0 006 0c0-1-1-2-1-2s0 1-1 1-1-1-1-2c-2 1-2 2-2 3z"/></svg>',
  globe: '<svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 100 20 10 10 0 000-20zm0 2c1.5 1.8 2.4 4.6 2.5 8H9.5c.1-3.4 1-6.2 2.5-8zM4 12a8 8 0 015-7.4A18 18 0 007.5 12 18 18 0 009 19.4 8 8 0 014 12zm11 7.4A18 18 0 0016.5 12 18 18 0 0015 4.6 8 8 0 0115 19.4z"/></svg>',
};

async function renderOverview() {
  const { days, agg } = cache;
  const total = totalTime(days);
  const activeDays = activeDaysCount(days) || 1;
  const todayDay = await getDay(dayKey());
  const todayTotal = todayDay ? sum(Object.values(todayDay.domains).map((r) => r.t)) : 0;

  // Previous equal-length window (only for fixed day-count ranges).
  let deltaPct = null;
  if (typeof currentRange === 'number' && currentRange !== 1) {
    const curKeys = rangeKeys(currentRange);
    const prevEnd = addDays(parseDayKey(curKeys[0]), -1);
    const prevDays = await getDays(rangeKeys(currentRange, prevEnd));
    deltaPct = trend(total, totalTime(prevDays));
  }

  const cats = byCategory(agg, settings.categoryMap);
  const score = focusScore(cats);
  const idx = await getIndex();
  const streak = currentStreak(idx, dayKey());

  $('#summaryCards').innerHTML = [
    statCard({ icon: ICONS.clock, val: formatDuration(todayTotal), lbl: t('card.today') }),
    statCard({ icon: ICONS.cal, val: formatDuration(total), lbl: rangeLabel(), delta: deltaPct }),
    statCard({ icon: ICONS.avg, val: formatDuration(total / activeDays), lbl: t('card.avg') }),
    statCard({ icon: ICONS.focus, val: score == null ? '—' : `${score}`, lbl: t('card.focus') }),
    statCard({ icon: ICONS.globe, val: Object.keys(agg).length, lbl: t('card.sites') }),
    statCard({ icon: ICONS.fire, val: `${streak} ${t('unit.days')}`, lbl: t('card.streak') }),
  ].join('');

  // Trend chart
  let trendKeys;
  let trendDays;
  if (currentRange === 1) { trendKeys = rangeKeys(7); trendDays = await getDays(trendKeys); }
  else if (currentRange === 'all') { trendKeys = cache.keys.slice(-60); trendDays = days; }
  else { trendKeys = cache.keys; trendDays = days; }
  const totals = dailyTotals(trendDays, trendKeys);
  const labelEvery = totals.length > 20 ? Math.ceil(totals.length / 12) : 1;
  barChart($('#trendChart'), totals.map((d, i) => ({
    label: i % labelEvery === 0 ? `${parseDayKey(d.key).getDate()}/${parseDayKey(d.key).getMonth() + 1}` : '',
    value: d.t,
    title: `${parseDayKey(d.key).toLocaleDateString(locale())}: ${formatDuration(d.t)}`,
  })), { height: 240, goal: settings.dailyGoalMinutes * 60, valueFmt: formatDuration });
  const avgLine = totals.length ? sum(totals.map((x) => x.t)) / totals.length : 0;
  $('#trendHint').textContent = t('hint.avgPerDay', { v: formatDuration(avgLine) });

  donutChart($('#categoryDonut'), cats.map((c) => ({ label: categoryLabel(c.key), value: c.t, color: c.color })),
    { size: 180, thickness: 26, legend: $('#categoryLegend') });

  await renderInsightsPanel();
  await renderCompare();
  renderTopList($('#overviewTop'), topSites(agg, 8), total);
}

async function renderInsightsPanel() {
  const thisKeys = rangeKeys(7);
  const lastKeys = rangeKeys(7, addDays(parseDayKey(thisKeys[0]), -1));
  const [tw, lw] = await Promise.all([getDays(thisKeys), getDays(lastKeys)]);
  const items = generateInsights(tw, lw, settings.categoryMap);
  const host = $('#insightsPanel');
  host.innerHTML = '';
  if (!items.length) { host.innerHTML = `<div class="empty">${t('insight.none')}</div>`; return; }
  for (const it of items) {
    const vars = { ...it.vars };
    if (vars.cat != null) vars.cat = categoryLabel(vars.cat);
    if (vars.wd != null) vars.wd = weekdaysFull(settings.language)[vars.wd];
    const row = document.createElement('div');
    row.className = 'insight-item';
    row.innerHTML = `<span class="insight-ic">💡</span><span>${t(it.key, vars)}</span>`;
    host.appendChild(row);
  }
}

async function renderCompare() {
  const thisKeys = rangeKeys(7);
  const lastKeys = rangeKeys(7, addDays(parseDayKey(thisKeys[0]), -1));
  const [tw, lw] = await Promise.all([getDays(thisKeys), getDays(lastKeys)]);
  const host = $('#comparePanel');
  const twTotal = totalTime(tw);
  const lwTotal = totalTime(lw);
  if (!twTotal && !lwTotal) { host.innerHTML = `<div class="empty">${t('compare.noData')}</div>`; return; }

  const twCats = byCategory(aggregateDomains(tw), settings.categoryMap);
  const lwCats = byCategory(aggregateDomains(lw), settings.categoryMap);
  const twProd = productiveTime(twCats);
  const lwProd = productiveTime(lwCats);
  const twScore = focusScore(twCats) || 0;
  const lwScore = focusScore(lwCats) || 0;

  const goal = settings.weeklyGoalMinutes * 60;
  const prodSuffix = goal > 0 ? ` · ${t('compare.ofGoal', { v: formatDuration(goal) })}` : '';

  host.innerHTML = '';
  host.appendChild(compareRow(t('compare.total'), twTotal, lwTotal, formatDuration));
  host.appendChild(compareRow(t('card.productive') + prodSuffix, twProd, lwProd, formatDuration, goal || undefined));
  host.appendChild(compareRow(t('card.focusScore'), twScore, lwScore, (v) => `${Math.round(v)}/100`, 100));
}

function compareRow(label, now, prev, fmt, max) {
  const top = max || Math.max(now, prev, 1);
  const delta = prev ? Math.round(((now - prev) / prev) * 100) : null;
  const row = document.createElement('div');
  row.className = 'cmp-row';
  const deltaCls = delta == null ? 'flat' : (delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat');
  const deltaTxt = delta == null ? '' : `${delta > 0 ? '▲' : delta < 0 ? '▼' : ''} ${Math.abs(delta)}%`;
  row.innerHTML = `
    <div class="cmp-label"><span>${label}</span><span class="delta ${deltaCls}">${deltaTxt}</span></div>
    <div class="cmp-bars">
      <div class="cmp-bar"><span class="tag">${t('compare.thisWeek')}</span>
        <span class="track"><span class="fill now" style="width:${Math.max(2, (now / top) * 100)}%"></span></span>
        <span class="v">${fmt(now)}</span></div>
      <div class="cmp-bar"><span class="tag">${t('compare.lastWeek')}</span>
        <span class="track"><span class="fill prev" style="width:${Math.max(2, (prev / top) * 100)}%"></span></span>
        <span class="v">${fmt(prev)}</span></div>
    </div>`;
  return row;
}

function renderTopList(host, list, total) {
  host.innerHTML = '';
  if (!list.length) { host.innerHTML = `<div class="empty">${t('empty.range')}</div>`; return; }
  const max = list[0].t || 1;
  for (const s of list) {
    const catKey = categorize(s.domain, settings.categoryMap);
    const def = categoryDef(catKey);
    const row = document.createElement('div');
    row.className = 'tl-row';
    row.innerHTML = `
      <img src="${iconFor(s.domain)}" loading="lazy" alt="" />
      <span class="tl-name" title="${s.domain}">${s.domain}</span>
      <span class="tl-bar"><span class="tl-fill" style="width:${Math.max(3, (s.t / max) * 100)}%"></span></span>
      <span class="tl-cat" style="background:${def.color}22;color:${def.color}">${categoryLabel(catKey)}</span>
      <span class="tl-time">${formatDuration(s.t)}</span>`;
    row.addEventListener('click', () => openSiteDetail(s.domain));
    host.appendChild(row);
  }
}

// ---------------- SITES ----------------
async function renderSites() {
  const src = await sitesSource();
  const term = $('#siteSearch').value.trim().toLowerCase();
  const sortBy = $('#siteSort').value;
  let list = Object.values(src.agg);
  const total = list.reduce((a, s) => a + s.t, 0) || 1;
  if (term) list = list.filter((s) => s.domain.includes(term));
  list.sort((a, b) =>
    sortBy === 'visits' ? b.v - a.v : sortBy === 'name' ? a.domain.localeCompare(b.domain) : b.t - a.t);

  const body = $('#sitesBody');
  body.innerHTML = '';
  $('#sitesEmpty').classList.toggle('hidden', list.length > 0);

  for (const s of list) {
    const catKey = categorize(s.domain, settings.categoryMap);
    const def = categoryDef(catKey);
    const pct = ((s.t / total) * 100).toFixed(1);
    const limit = settings.siteLimits[s.domain] || '';
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><div class="site-cell"><img src="${iconFor(s.domain)}" loading="lazy" alt=""><span class="dom">${s.domain}</span></div></td>
      <td><span class="cat-pill" style="background:${def.color}22;color:${def.color}">${categoryLabel(catKey)}</span></td>
      <td>${formatDuration(s.t)}</td>
      <td>${s.v}</td>
      <td><div class="share-mini"><div class="bar"><div class="fill" style="width:${pct}%"></div></div><span>${pct}%</span></div></td>
      <td><input type="number" class="limit-input" min="0" placeholder="—" value="${limit}" data-domain="${s.domain}"></td>`;
    tr.addEventListener('click', (e) => { if (!e.target.closest('.limit-input')) openSiteDetail(s.domain, src); });
    body.appendChild(tr);
  }

  body.querySelectorAll('.limit-input').forEach((inp) => {
    inp.addEventListener('click', (e) => e.stopPropagation());
    inp.addEventListener('change', async () => {
      const dom = inp.dataset.domain;
      const val = parseInt(inp.value, 10);
      const siteLimits = { ...settings.siteLimits };
      if (val > 0) siteLimits[dom] = val; else delete siteLimits[dom];
      settings = await saveSettings({ siteLimits });
      send('settingsChanged');
      toast(val > 0 ? t('toast.limitSaved', { d: dom }) : t('toast.limitRemoved', { d: dom }), 'success');
    });
  });
}

// ---------------- SITE DETAIL MODAL ----------------
function openSiteDetail(domain, source = cache) {
  const keys = source.keys;
  const days = source.days;
  const timeline = keys.map((k) => ({ key: k, t: days[k]?.domains[domain]?.t || 0 }));
  const totalT = sum(timeline.map((d) => d.t));
  const totalV = sum(keys.map((k) => days[k]?.domains[domain]?.v || 0));
  const activeD = timeline.filter((d) => d.t > 0).length || 1;
  let busiest = null;
  for (const d of timeline) if (!busiest || d.t > busiest.t) busiest = d;
  const peakH = domainPeakHour(days, domain);
  const hourly = domainHourly(days, domain);
  const catKey = categorize(domain, settings.categoryMap);
  const def = categoryDef(catKey);
  const blocked = settings.blacklist.includes(domain);

  const card = $('#siteModalCard');
  card.innerHTML = `
    <div class="modal-head">
      <div class="site-cell"><img src="${iconFor(domain)}" alt=""><h3>${domain}</h3></div>
      <button class="modal-close" id="modalClose">✕</button>
    </div>
    <div class="detail-stats">
      <div class="detail-stat"><div class="v">${formatDuration(totalT)}</div><div class="l">${t('detail.totalTime')}</div></div>
      <div class="detail-stat"><div class="v">${totalV}</div><div class="l">${t('detail.visits')}</div></div>
      <div class="detail-stat"><div class="v">${formatDuration(totalT / activeD)}</div><div class="l">${t('detail.dailyAvg')}</div></div>
      <div class="detail-stat"><div class="v">${peakH == null ? '—' : `${peakH}:00`}</div><div class="l">${t('detail.peakHour')}</div></div>
      <div class="detail-stat"><div class="v">${busiest && busiest.t ? parseDayKey(busiest.key).toLocaleDateString(locale(), { day: 'numeric', month: 'short' }) : '—'}</div><div class="l">${t('detail.peak')}</div></div>
    </div>
    <div class="detail-section-title">${t('detail.category')}: <span style="color:${def.color}">${categoryLabel(catKey)}</span></div>
    <div class="detail-section-title">${t('detail.timeline')}</div>
    <div id="detailChart" class="chart-box"></div>
    ${hourly ? `<div class="detail-section-title">${t('detail.hourly')}</div><div id="detailHourly" class="chart-box"></div>` : ''}
    <div class="detail-actions">
      <button class="btn ${blocked ? 'ghost' : 'danger'}" id="detailTrackToggle">${blocked ? t('detail.resumeTracking') : t('detail.stopTracking')}</button>
    </div>`;

  $('#siteModal').classList.remove('hidden');
  $('#modalClose').addEventListener('click', closeModal);
  $('#detailTrackToggle').addEventListener('click', () => toggleBlacklist(domain, source));

  const labelEvery = timeline.length > 20 ? Math.ceil(timeline.length / 12) : 1;
  barChart($('#detailChart'), timeline.map((d, i) => ({
    label: i % labelEvery === 0 ? `${parseDayKey(d.key).getDate()}/${parseDayKey(d.key).getMonth() + 1}` : '',
    value: d.t,
    title: `${parseDayKey(d.key).toLocaleDateString(locale())}: ${formatDuration(d.t)}`,
  })), { height: 200, valueFmt: formatDuration });

  if (hourly) {
    barChart($('#detailHourly'), hourly.map((v, h) => ({
      label: h % 3 === 0 ? `${h}` : '',
      value: v,
      title: `${h}:00 - ${h + 1}:00: ${formatDuration(v)}`,
    })), { height: 170, valueFmt: formatDuration });
  }
}

// Toggle a domain in the never-track blacklist from its detail modal.
async function toggleBlacklist(domain, source) {
  const set = new Set(settings.blacklist);
  const wasBlocked = set.has(domain);
  if (wasBlocked) set.delete(domain); else set.add(domain);
  settings = await saveSettings({ blacklist: [...set] });
  await send('settingsChanged');
  toast(wasBlocked ? t('toast.blacklistRemoved', { d: domain }) : t('toast.blacklistAdded', { d: domain }), 'success');
  openSiteDetail(domain, source);
}

function closeModal() {
  $('#siteModal').classList.add('hidden');
  $('#welcomeModal').classList.add('hidden');
}

// ---------------- INSIGHTS ----------------
function renderInsights() {
  const { days, agg } = cache;
  const dist = hourlyDistribution(days);
  const peak = busiestHour(dist);
  const cats = byCategory(agg, settings.categoryMap);
  const score = focusScore(cats);

  $('#insightCards').innerHTML = [
    statCard({ icon: ICONS.clock, val: peak == null ? '—' : `${peak}:00-${peak + 1}:00`, lbl: t('card.peakHour') }),
    statCard({ icon: ICONS.focus, val: formatDuration(productiveTime(cats)), lbl: t('card.productive') }),
    statCard({ icon: ICONS.fire, val: formatDuration(distractingTime(cats)), lbl: t('card.distracting') }),
    statCard({ icon: ICONS.avg, val: score == null ? '—' : `${score}/100`, lbl: t('card.focusScore') }),
  ].join('');

  heatmap($('#heatmap'), weekHourHeatmap(days), {
    weekdayLabels: weekdaysShort(settings.language),
    hourFmt: (h) => `${h}:00`,
  });

  barChart($('#hourlyChart'), dist.map((v, h) => ({
    label: h % 3 === 0 ? `${h}` : '',
    value: v,
    title: `${h}:00 - ${h + 1}:00: ${formatDuration(v)}`,
  })), { height: 200, valueFmt: formatDuration });

  const host = $('#categoryBreakdown');
  host.innerHTML = '';
  if (!cats.length) { host.innerHTML = `<div class="empty">${t('empty.generic')}</div>`; return; }
  for (const c of cats) {
    const row = document.createElement('div');
    row.className = 'cb-row';
    row.innerHTML = `
      <div class="cb-top">
        <span class="lbl"><span class="cb-dot" style="background:${c.color}"></span>${categoryLabel(c.key)}</span>
        <span class="cb-time">${formatDuration(c.t)} · ${Math.round(c.share * 100)}%</span>
      </div>
      <div class="cb-track"><div class="cb-fill" style="width:${Math.max(2, c.share * 100)}%;background:${c.color}"></div></div>`;
    host.appendChild(row);
  }
}

// ---------------- SETTINGS ----------------
function fillSettingsForm() {
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
  $('#setSyncEnabled').checked = settings.backup.syncEnabled;
  $('#setBackupInterval').value = settings.backup.autoIntervalHours;
  $('#setEndpoint').value = settings.backup.endpointUrl;
  $('#setEndpointToken').value = settings.backup.endpointToken;
  $('#setEncrypt').checked = settings.backup.encrypt;
  $('#setPassphrase').value = settings.backup.passphrase;
  $('#setRetention').value = settings.retentionDays;
  renderFocusCats('#focusCats', 'blockCategories');
  renderFocusCats('#focusAllowCats', 'allowCategories');
  renderFocusDomains('#focusBlockDomains', 'blockDomains');
  renderFocusDomains('#focusAllowDomains', 'allowDomains');
  updateFocusModeFields();
  renderBackupStatus();
  renderStorageInfo();
  renderCategoryEditor();
  renderBlacklist();
}

function updateFocusModeFields() {
  const allow = settings.focus.mode === 'allow';
  $('#focusBlockField').classList.toggle('hidden', allow);
  $('#focusAllowField').classList.toggle('hidden', !allow);
}

function renderFocusCats(hostSel, settingKey) {
  const host = $(hostSel);
  host.innerHTML = '';
  const chosen = new Set(settings.focus[settingKey]);
  for (const key of CATEGORY_ORDER) {
    if (key === 'other') continue;
    const def = CATEGORY_DEFS[key];
    const label = document.createElement('label');
    label.className = 'chip-check' + (chosen.has(key) ? ' on' : '');
    label.innerHTML = `<input type="checkbox" ${chosen.has(key) ? 'checked' : ''}>
      <span class="dot" style="background:${def.color}"></span>${categoryLabel(key)}`;
    label.querySelector('input').addEventListener('change', async (e) => {
      const set = new Set(settings.focus[settingKey]);
      if (e.target.checked) set.add(key); else set.delete(key);
      settings = await saveSettings({ focus: { [settingKey]: [...set] } });
      label.classList.toggle('on', e.target.checked);
    });
    host.appendChild(label);
  }
}

// Removable chips for a focus domain list (blockDomains / allowDomains).
function renderFocusDomains(hostSel, settingKey) {
  const host = $(hostSel);
  host.innerHTML = '';
  for (const domain of settings.focus[settingKey] || []) {
    const chip = document.createElement('div');
    chip.className = 'cat-chip';
    chip.innerHTML = `<span>${domain}</span><span class="x">✕</span>`;
    chip.querySelector('.x').addEventListener('click', async () => {
      const next = (settings.focus[settingKey] || []).filter((d) => d !== domain);
      settings = await saveSettings({ focus: { [settingKey]: next } });
      renderFocusDomains(hostSel, settingKey);
    });
    host.appendChild(chip);
  }
}

async function addFocusDomain(inputSel, settingKey, hostSel) {
  const input = $(inputSel);
  if (!input.value.trim()) return;
  const domain = cleanDomain(input.value);
  if (!domain) { toast(t('toast.badDomain'), 'error'); return; }
  const set = new Set(settings.focus[settingKey] || []);
  set.add(domain);
  settings = await saveSettings({ focus: { [settingKey]: [...set] } });
  input.value = '';
  renderFocusDomains(hostSel, settingKey);
}

// ---- never-track blacklist editor ----
function renderBlacklist() {
  const list = $('#blacklistList');
  list.innerHTML = '';
  const entries = settings.blacklist || [];
  if (!entries.length) {
    list.innerHTML = `<span style="color:var(--text-faint);font-size:12.5px">${t('blacklist.none')}</span>`;
    return;
  }
  for (const domain of entries) {
    const chip = document.createElement('div');
    chip.className = 'cat-chip';
    chip.innerHTML = `<span>🚫 ${domain}</span><span class="x">✕</span>`;
    chip.querySelector('.x').addEventListener('click', async () => {
      const next = (settings.blacklist || []).filter((d) => d !== domain);
      settings = await saveSettings({ blacklist: next });
      await send('settingsChanged');
      renderBlacklist();
      toast(t('toast.blacklistRemoved', { d: domain }), 'success');
    });
    list.appendChild(chip);
  }
}

async function addBlacklist() {
  const input = $('#blacklistDomain');
  if (!input.value.trim()) return;
  const domain = cleanDomain(input.value);
  if (!domain) { toast(t('toast.badDomain'), 'error'); return; }
  const set = new Set(settings.blacklist || []);
  set.add(domain);
  settings = await saveSettings({ blacklist: [...set] });
  await send('settingsChanged');
  input.value = '';
  renderBlacklist();
  toast(t('toast.blacklistAdded', { d: domain }), 'success');
}

function renderBackupStatus() {
  const b = settings.backup;
  const last = b.lastBackup ? new Date(b.lastBackup).toLocaleString(locale()) : t('backup.never');
  $('#backupStatus').innerHTML = `${t('backup.last')} <strong>${last}</strong><br>${b.lastBackupStatus || ''}`;
}

async function renderStorageInfo() {
  const bytes = await storageFootprint();
  const idx = await getIndex();
  $('#storageInfo').textContent = `${(bytes / 1024).toFixed(1)} KB · ${idx.length} ${t('unit.days')}`;
}

async function persist(patch) {
  settings = await saveSettings(patch);
  await send('settingsChanged');
}

function wireSettings() {
  const bindSwitch = (id, key, after) => $(id).addEventListener('change', async (e) => {
    await persist({ [key]: e.target.checked }); after?.();
  });
  bindSwitch('#setEnabled', 'enabled', () => updateTrackState());
  bindSwitch('#setAudible', 'countAudibleBackground');
  bindSwitch('#setGroup', 'groupSubdomains', async () => { await refresh(); });
  bindSwitch('#setNotify', 'notifyLimits');
  bindSwitch('#setWeeklySummary', 'weeklySummary');

  $('#setLanguage').addEventListener('change', async (e) => {
    await persist({ language: e.target.value });
    applyLanguage(); fillSettingsForm(); rerenderCharts();
  });
  $('#setTheme').addEventListener('change', async (e) => { await persist({ theme: e.target.value }); applyTheme(); rerenderCharts(); });
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
    rerenderCharts();
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

  $('#backupNow').addEventListener('click', async () => {
    toast(t('toast.backingUp'));
    const r = await send('runBackup');
    settings = await getSettings();
    renderBackupStatus();
    toast(r?.ran ? t('toast.backupDone') : (r?.status || t('toast.noTarget')), r?.ok === false ? 'error' : 'success');
  });

  $('#restoreSync').addEventListener('click', async () => {
    if (!confirm(t('confirm.restore'))) return;
    try {
      await doRestore();
    } catch (e) {
      if (e.code === 'ENCRYPTED') {
        const pass = prompt(t('prompt.passphrase'));
        if (pass) { try { await doRestore(pass); } catch (e2) { toast(e2.message, 'error'); } }
      } else {
        toast(e.message, 'error');
      }
    }
  });

  // Export / import
  $('#exportJson').addEventListener('click', () => exportData(false));
  $('#exportCsv').addEventListener('click', () => exportCsv(false));
  $('#exportView').addEventListener('click', () => exportCsv(true));
  $('#importBtn').addEventListener('click', () => $('#importFile').click());
  $('#importFile').addEventListener('change', handleImport);
  $('#importCsvBtn').addEventListener('click', () => $('#importCsvFile').click());
  $('#importCsvFile').addEventListener('change', handleCsvImport);

  $('#clearData').addEventListener('click', async () => {
    if (!confirm(t('confirm.clear'))) return;
    await clearAllData();
    allCache = null;
    await refresh();
    renderStorageInfo();
    toast(t('toast.cleared'), 'success');
  });

  $('#catAdd').addEventListener('click', addCategoryMapping);
  $('#catDomain').addEventListener('keydown', (e) => { if (e.key === 'Enter') addCategoryMapping(); });

  $('#blacklistAdd').addEventListener('click', addBlacklist);
  $('#blacklistDomain').addEventListener('keydown', (e) => { if (e.key === 'Enter') addBlacklist(); });
}

async function doRestore(passphrase) {
  const r = await restoreFromSync({ mode: 'replace', passphrase });
  allCache = null;
  settings = await getSettings();
  applyLanguage();
  applyTheme();
  await refresh();
  fillSettingsForm();
  toast(t('toast.restored', { n: r.days }), 'success');
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

async function exportData() {
  const data = await exportAll();
  await download(`timetrack-backup-${dayKey()}.json`, JSON.stringify(data, null, 2), 'application/json');
  toast(t('toast.exportedJson'), 'success');
}

async function exportCsv(currentViewOnly) {
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

async function handleImport(e) {
  const file = e.target.files[0];
  if (!file) return;
  try {
    let snapshot = JSON.parse(await file.text());
    if (isEncrypted(snapshot)) {
      const pass = prompt(t('prompt.passphrase'));
      if (!pass) { e.target.value = ''; return; }
      snapshot = await decryptJSON(snapshot, pass);
    }
    const mode = $('#importMode').value;
    const count = await importAll(snapshot, { mode, includeSettings: true });
    allCache = null;
    settings = await getSettings();
    applyLanguage();
    applyTheme();
    await refresh();
    fillSettingsForm();
    toast(t('toast.imported', { n: count, mode: mode === 'merge' ? t('import.merge') : t('import.replace') }), 'success');
  } catch (err) {
    toast(t('toast.importErr', { e: err.message }), 'error');
  } finally {
    e.target.value = '';
  }
}

// ---- CSV import (migration path) ----
function parseCsv(text) {
  const rows = [];
  let field = '';
  let row = [];
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false;
      } else field += c;
    } else if (c === '"') {
      inQ = true;
    } else if (c === ',') {
      row.push(field); field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((x) => x !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); if (row.some((x) => x !== '')) rows.push(row); }
  return rows;
}

async function handleCsvImport(e) {
  const file = e.target.files[0];
  if (!file) return;
  try {
    let text = await file.text();
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1); // strip BOM
    const rows = parseCsv(text);
    if (rows.length < 2) throw new Error('CSV empty');
    const header = rows[0].map((h) => h.trim().toLowerCase());
    const iDate = header.indexOf('date');
    const iDom = header.indexOf('domain');
    const iSec = header.indexOf('seconds');
    const iMin = header.indexOf('minutes');
    const iVis = header.indexOf('visits');
    if (iDate < 0 || iDom < 0 || (iSec < 0 && iMin < 0)) throw new Error('missing date/domain/seconds columns');

    const days = {};
    for (let r = 1; r < rows.length; r++) {
      const c = rows[r];
      const date = (c[iDate] || '').trim();
      const domain = (c[iDom] || '').trim().toLowerCase();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !domain) continue;
      const sec = iSec >= 0 ? parseFloat(c[iSec]) : parseFloat(c[iMin]) * 60;
      if (!(sec > 0)) continue;
      const vis = iVis >= 0 ? (parseInt(c[iVis], 10) || 0) : 0;
      if (!days[date]) days[date] = { domains: {}, hours: new Array(24).fill(0) };
      const cur = days[date].domains[domain] || { t: 0, v: 0 };
      cur.t += Math.round(sec); cur.v += vis;
      days[date].domains[domain] = cur;
    }
    const count = Object.keys(days).length;
    if (!count) throw new Error('no valid rows');
    const mode = $('#importMode').value;
    await importAll({ app: 'TimeTrack', version: 2, days }, { mode, includeSettings: false });
    allCache = null;
    await refresh();
    renderStorageInfo();
    toast(t('toast.importedCsv', { n: count }), 'success');
  } catch (err) {
    toast(t('toast.importErr', { e: err.message }), 'error');
  } finally {
    e.target.value = '';
  }
}

// ---- category editor ----
function renderCategoryEditor() {
  const sel = $('#catSelect');
  sel.innerHTML = '';
  for (const key of CATEGORY_ORDER) {
    const o = document.createElement('option');
    o.value = key; o.textContent = categoryLabel(key);
    sel.appendChild(o);
  }
  const list = $('#catList');
  list.innerHTML = '';
  const entries = Object.entries(settings.categoryMap);
  if (!entries.length) { list.innerHTML = `<span style="color:var(--text-faint);font-size:12.5px">${t('cat.none')}</span>`; return; }
  for (const [domain, cat] of entries) {
    const def = categoryDef(cat);
    const chip = document.createElement('div');
    chip.className = 'cat-chip';
    chip.innerHTML = `<span class="dot" style="background:${def.color}"></span>
      <span>${domain} → ${categoryLabel(cat)}</span>
      <span class="x" data-domain="${domain}">✕</span>`;
    chip.querySelector('.x').addEventListener('click', async () => {
      const map = { ...settings.categoryMap };
      delete map[domain];
      settings = await saveSettings({ categoryMap: map });
      renderCategoryEditor();
      rerenderCharts();
    });
    list.appendChild(chip);
  }
}

async function addCategoryMapping() {
  const domain = $('#catDomain').value.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '');
  const cat = $('#catSelect').value;
  if (!domain) return;
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) { toast(t('toast.badDomain'), 'error'); return; }
  const map = { ...settings.categoryMap, [domain]: cat };
  settings = await saveSettings({ categoryMap: map });
  $('#catDomain').value = '';
  renderCategoryEditor();
  rerenderCharts();
  toast(t('toast.catSaved', { d: domain, c: categoryLabel(cat) }), 'success');
}

// ---------------- navigation / refresh ----------------
function switchTab(tab) {
  currentTab = tab;
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
  settings = await getSettings();
  await ensureFaviconPermission();
  applyTheme();
  applyLanguage();
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
    currentRange = b.dataset.range === 'all' ? 'all' : parseInt(b.dataset.range, 10);
    refresh();
  }));

  // custom range
  $('#rangeTo').value = dayKey();
  $('#rangeFrom').value = dayKey(addDays(new Date(), -13));
  $('#rangeApply').addEventListener('click', () => {
    const from = $('#rangeFrom').value ? parseDayKey($('#rangeFrom').value) : addDays(new Date(), -13);
    const to = $('#rangeTo').value ? parseDayKey($('#rangeTo').value) : new Date();
    if (from > to) { toast(t('range.from') + ' > ' + t('range.to'), 'error'); return; }
    currentRange = { from, to };
    refresh();
  });

  $('#siteSearch').addEventListener('input', () => { if (currentTab === 'sites') renderSites(); });
  $('#siteSort').addEventListener('change', () => { if (currentTab === 'sites') renderSites(); });
  $('#siteAllHistory').addEventListener('change', (e) => {
    siteAllHistory = e.target.checked;
    if (siteAllHistory) allCache = null;    // rebuild a fresh full-history aggregate
    if (currentTab === 'sites') renderSites();
  });

  wireSettings();

  // modal dismissal
  $('#siteModal').addEventListener('click', (e) => { if (e.target.id === 'siteModal') closeModal(); });
  $('#welcomeModal').addEventListener('click', (e) => { if (e.target.id === 'welcomeModal') closeModal(); });
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

function debounce(fn, ms) {
  let timer;
  return (...a) => { clearTimeout(timer); timer = setTimeout(() => fn(...a), ms); };
}

init();
