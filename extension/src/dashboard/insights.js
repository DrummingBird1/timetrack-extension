// Insights tab: hour/day heatmap, hourly distribution, category breakdown.
import { getDays, getFocusLog } from '../lib/storage.js';
import { formatDuration, weekdaysShort, rangeKeys, parseDayKey } from '../lib/utils.js';
import { hourlyDistribution, busiestHour, byCategory, focusScore, weekHourHeatmap, weeklyFocusScores, bestWeek, focusLogStats } from '../lib/stats.js';
import { barChart, heatmap } from '../lib/charts.js';
import { t, locale, categoryLabel } from '../lib/i18n.js';
import { $, settings, cache, statCard, ICONS, productiveTime, distractingTime } from './core.js';

export async function renderInsights() {
  renderFocusTrend();
  renderFocusLog();
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

const TREND_WEEKS = 12;

/** Weekly focus score for the last 12 weeks (independent of the range picker), with the best week called out. */
async function renderFocusTrend() {
  const keys = rangeKeys(TREND_WEEKS * 7 + 6);
  const weeks = weeklyFocusScores(await getDays(keys), { weekStart: settings.weekStart, weeks: TREND_WEEKS, categoryMap: settings.categoryMap });
  const best = bestWeek(weeks);
  const host = $('#focusTrendChart');
  if (!best) {
    host.innerHTML = `<div class="empty">${t('focusTrend.none')}</div>`;
    $('#focusTrendHint').textContent = '';
    return;
  }
  const label = (w) => parseDayKey(w.weekKey).toLocaleDateString(locale(), { day: 'numeric', month: 'short' });
  $('#focusTrendHint').textContent = t('panel.focusTrendHint', { w: label(best), n: best.score });
  barChart(host, weeks.map((w) => ({
    label: w.weekKey === weeks[0].weekKey || w === best || w === weeks[weeks.length - 1] ? label(w) : '',
    value: w.score ?? 0,
    title: `${label(w)}: ${w.score == null ? '—' : w.score + '/100'}`,
  })), { height: 200, goal: 0, valueFmt: (v) => Math.round(v) });
}

/** Focus-session history: totals for the last 90 days and the most recent sessions. */
async function renderFocusLog() {
  const log = await getFocusLog();
  const host = $('#focusLogBody');
  if (!log.length) {
    host.innerHTML = `<div class="empty">${t('focusLog.none')}</div>`;
    return;
  }
  const stats = focusLogStats(log, Date.now() - 90 * 86400000);
  const fmtDate = (ms) => new Date(ms).toLocaleDateString(locale(), { day: 'numeric', month: 'short' });
  const rows = log.slice(-8).reverse().map((e) => `
    <div class="tl-row">
      <span class="tl-name">${fmtDate(e.start)}</span>
      <span class="tl-cat">${t('focusLog.row', { done: e.completedCycles, total: e.cycles, m: Math.round(e.workedMs / 60000) })}</span>
      <span class="tl-time">${e.endedEarly ? t('focusLog.early') : '✓'}</span>
    </div>`).join('');
  host.innerHTML = `
    <div class="detail-stats">
      <div class="detail-stat"><div class="v">${stats.sessions}</div><div class="l">${t('focusLog.sessions')}</div></div>
      <div class="detail-stat"><div class="v">${formatDuration(stats.totalWorkedMs / 1000)}</div><div class="l">${t('focusLog.total')}</div></div>
      <div class="detail-stat"><div class="v">${Math.round(stats.completionRate * 100)}%</div><div class="l">${t('focusLog.rate')}</div></div>
    </div>
    <div class="top-list-full">${rows}</div>`;
}
