// Overview tab: summary cards, trend chart, category donut, insights, week-over-week comparison.
import { getIndex, getDays, getDay } from '../lib/storage.js';
import { dayKey, rangeKeys, parseDayKey, addDays, formatDuration, sum, weekdaysFull } from '../lib/utils.js';
import {
  aggregateDomains, totalTime, topSites, byCategory, focusScore, dailyTotals,
  activeDaysCount, currentStreak, trend, generateInsights,
} from '../lib/stats.js';
import { categorize, categoryDef } from '../lib/categories.js';
import { barChart, donutChart } from '../lib/charts.js';
import { t, locale, categoryLabel } from '../lib/i18n.js';
import { $, settings, currentRange, cache, rangeLabel, iconFor, statCard, ICONS, productiveTime } from './core.js';
import { openSiteDetail } from './siteDetail.js';

export async function renderOverview() {
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
