// Site detail modal: per-site stats and charts, alias merge, never-track toggle.
import { getSettings, saveSettings, mergeDomainAlias, getSessions } from '../lib/storage.js';
import { parseDayKey, formatDuration, sum } from '../lib/utils.js';
import { domainPeakHour, domainHourly, firstLastVisit, sessionStats, SESSION_BUCKET_LABELS } from '../lib/stats.js';
import { categorize, categoryDef } from '../lib/categories.js';
import { barChart } from '../lib/charts.js';
import { t, locale, categoryLabel } from '../lib/i18n.js';
import {
  $, settings, setSettings, cache, setAllCache, iconFor, cleanDomain, toast, send, closeModal, actions,
} from './core.js';

export function openSiteDetail(domain, source = cache) {
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
  const { first, last } = firstLastVisit(days, keys, domain);
  const fmtDay = (k) => k ? parseDayKey(k).toLocaleDateString(locale(), { day: 'numeric', month: 'short' }) : '—';

  const card = $('#siteModalCard');
  card.innerHTML = `
    <div class="modal-head">
      <div class="site-cell"><img src="${iconFor(domain)}" alt=""><h3>${domain}</h3></div>
      <button class="modal-close" id="modalClose" aria-label="${t('btn.close')}">✕</button>
    </div>
    <div class="detail-stats">
      <div class="detail-stat"><div class="v">${formatDuration(totalT)}</div><div class="l">${t('detail.totalTime')}</div></div>
      <div class="detail-stat"><div class="v">${totalV}</div><div class="l">${t('detail.visits')}</div></div>
      <div class="detail-stat"><div class="v">${formatDuration(totalT / activeD)}</div><div class="l">${t('detail.dailyAvg')}</div></div>
      <div class="detail-stat"><div class="v">${peakH == null ? '—' : `${peakH}:00`}</div><div class="l">${t('detail.peakHour')}</div></div>
      <div class="detail-stat"><div class="v">${busiest && busiest.t ? fmtDay(busiest.key) : '—'}</div><div class="l">${t('detail.peak')}</div></div>
      <div class="detail-stat"><div class="v">${fmtDay(first)}</div><div class="l">${t('detail.firstVisit')}</div></div>
      <div class="detail-stat"><div class="v">${fmtDay(last)}</div><div class="l">${t('detail.lastVisit')}</div></div>
    </div>
    <div class="detail-section-title">${t('detail.category')}: <span class="cat-text" style="--c:${def.color}">${categoryLabel(catKey)}</span></div>
    <div class="detail-section-title">${t('detail.timeline')}</div>
    <div id="detailChart" class="chart-box"></div>
    ${hourly ? `<div class="detail-section-title">${t('detail.hourly')}</div><div id="detailHourly" class="chart-box"></div>` : ''}
    <div id="detailSessions"></div>
    <div class="detail-section-title">${t('detail.mergeInto')}</div>
    <div class="set-desc" style="margin-bottom:9px">${t('detail.mergeIntoDesc')}</div>
    <div class="detail-actions">
      <div class="detail-merge">
        <input type="text" id="mergeDomainInput" placeholder="${t('detail.mergeIntoPh')}" />
        <button class="btn" id="mergeDomainBtn">${t('detail.mergeBtn')}</button>
      </div>
      <div class="detail-track-row">
        <button class="btn ${blocked ? 'ghost' : 'danger'}" id="detailTrackToggle">${blocked ? t('detail.resumeTracking') : t('detail.stopTracking')}</button>
      </div>
    </div>`;

  $('#siteModal').setAttribute('aria-label', domain);
  $('#siteModal').classList.remove('hidden');
  $('#modalClose').addEventListener('click', closeModal);
  $('#detailTrackToggle').addEventListener('click', () => toggleBlacklist(domain, source));
  $('#mergeDomainBtn').addEventListener('click', () => mergeDomainInto(domain));
  $('#mergeDomainInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') mergeDomainInto(domain); });

  renderSessions(domain, keys);

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

// Visit-length distribution, from the opt-in session log. Loaded after the modal
// opens so the rest of the card appears immediately.
async function renderSessions(domain, keys) {
  const stats = sessionStats(await getSessions(keys), domain);
  const host = $('#detailSessions');
  if (!host) return;                                   // modal was closed or re-rendered meanwhile
  if (!stats.count) {
    host.innerHTML = `<div class="set-desc" style="margin:14px 0">${t(settings.sessionLog ? 'detail.sessionsNone' : 'detail.sessionsOff')}</div>`;
    return;
  }
  host.innerHTML = `
    <div class="detail-section-title">${t('detail.sessions')}</div>
    <div class="detail-stats">
      <div class="detail-stat"><div class="v">${stats.count}</div><div class="l">${t('detail.sessionCount')}</div></div>
      <div class="detail-stat"><div class="v">${formatDuration(stats.average)}</div><div class="l">${t('detail.sessionAvg')}</div></div>
      <div class="detail-stat"><div class="v">${formatDuration(stats.longest)}</div><div class="l">${t('detail.sessionMax')}</div></div>
    </div>
    <div id="detailSessionChart" class="chart-box"></div>`;
  barChart($('#detailSessionChart'), stats.buckets.map((count, i) => ({
    label: SESSION_BUCKET_LABELS[i],
    value: count,
    title: `${SESSION_BUCKET_LABELS[i]}: ${count}`,
  })), { height: 150 });
}

// Combine a rebranded/renamed site's history into another domain, from its detail modal.
async function mergeDomainInto(oldDomain) {
  const input = $('#mergeDomainInput');
  const newDomain = cleanDomain(input.value);
  if (!newDomain || newDomain === oldDomain) { toast(t('toast.mergeSameDomain'), 'error'); return; }
  if (!confirm(t('confirm.mergeDomain', { old: oldDomain, new: newDomain }))) return;
  toast(t('toast.mergeWorking'));
  const days = await mergeDomainAlias(oldDomain, newDomain);
  setSettings(await getSettings());
  setAllCache(null);
  closeModal();
  await actions.refresh();
  toast(t('toast.mergeDone', { old: oldDomain, new: newDomain, days }), 'success');
}

// Toggle a domain in the never-track blacklist from its detail modal.
async function toggleBlacklist(domain, source) {
  const set = new Set(settings.blacklist);
  const wasBlocked = set.has(domain);
  if (wasBlocked) set.delete(domain); else set.add(domain);
  setSettings(await saveSettings({ blacklist: [...set] }));
  await send('settingsChanged');
  toast(wasBlocked ? t('toast.blacklistRemoved', { d: domain }) : t('toast.blacklistAdded', { d: domain }), 'success');
  openSiteDetail(domain, source);
}
