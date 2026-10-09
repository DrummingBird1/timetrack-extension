// Insights tab: hour/day heatmap, hourly distribution, category breakdown.
import { formatDuration, weekdaysShort } from '../lib/utils.js';
import { hourlyDistribution, busiestHour, byCategory, focusScore, weekHourHeatmap } from '../lib/stats.js';
import { barChart, heatmap } from '../lib/charts.js';
import { t, categoryLabel } from '../lib/i18n.js';
import { $, settings, cache, statCard, ICONS, productiveTime, distractingTime } from './core.js';

export function renderInsights() {
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
