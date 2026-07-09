// Pure analytics over the day records. Everything here is side-effect free so
// the dashboard can slice the same data many ways cheaply.

import { parseDayKey, sum } from './utils.js';
import { categorize, CATEGORY_DEFS, categoryDef } from './categories.js';

/** Sum every domain's time/visits across a set of day records. */
export function aggregateDomains(days) {
  const out = {};
  for (const day of Object.values(days)) {
    for (const [domain, rec] of Object.entries(day.domains || {})) {
      if (!out[domain]) out[domain] = { domain, t: 0, v: 0 };
      out[domain].t += rec.t || 0;
      out[domain].v += rec.v || 0;
    }
  }
  return out;
}

export function totalTime(days) {
  let t = 0;
  for (const day of Object.values(days)) {
    for (const rec of Object.values(day.domains || {})) t += rec.t || 0;
  }
  return t;
}

export function topSites(domainAgg, limit = 0) {
  const list = Object.values(domainAgg).sort((a, b) => b.t - a.t);
  return limit ? list.slice(0, limit) : list;
}

/** Group aggregated domains by category, with time + share. */
export function byCategory(domainAgg, categoryMap = {}) {
  const buckets = {};
  let total = 0;
  for (const { domain, t } of Object.values(domainAgg)) {
    const cat = categorize(domain, categoryMap);
    buckets[cat] = (buckets[cat] || 0) + t;
    total += t;
  }
  return Object.entries(buckets)
    .map(([key, t]) => ({
      key,
      t,
      share: total ? t / total : 0,
      label: categoryDef(key).label,
      color: categoryDef(key).color,
    }))
    .sort((a, b) => b.t - a.t);
}

/** 0–100 focus score weighted by category productivity score. */
export function focusScore(categoryList) {
  let total = 0;
  let weighted = 0;
  for (const c of categoryList) {
    const def = CATEGORY_DEFS[c.key] || CATEGORY_DEFS.other;
    total += c.t;
    weighted += c.t * def.score; // -t .. +t
  }
  if (!total) return null;
  return Math.round(((weighted / total) + 1) * 50); // map [-1,1] -> [0,100]
}

/** Per-day totals for the given ordered keys (missing days => 0). */
export function dailyTotals(days, keys) {
  return keys.map((key) => {
    const day = days[key];
    const t = day ? sum(Object.values(day.domains || {}).map((r) => r.t || 0)) : 0;
    return { key, date: parseDayKey(key), t };
  });
}

/** 7×24 weekday-by-hour matrix of seconds, summed across all days. */
export function weekHourHeatmap(days) {
  const m = Array.from({ length: 7 }, () => new Array(24).fill(0));
  for (const [key, day] of Object.entries(days)) {
    const wd = parseDayKey(key).getDay();
    const hours = day.hours || [];
    for (let h = 0; h < 24; h++) m[wd][h] += hours[h] || 0;
  }
  return m;
}

/** Time-of-day distribution (24 buckets) summed across days. */
export function hourlyDistribution(days) {
  const out = new Array(24).fill(0);
  for (const day of Object.values(days)) {
    const hours = day.hours || [];
    for (let h = 0; h < 24; h++) out[h] += hours[h] || 0;
  }
  return out;
}

export function activeDaysCount(days) {
  return Object.values(days).filter(
    (d) => sum(Object.values(d.domains || {}).map((r) => r.t || 0)) > 0
  ).length;
}

/** Consecutive-day tracking streak ending today. */
export function currentStreak(index, todayKey) {
  if (!index.length) return 0;
  const set = new Set(index);
  let streak = 0;
  let d = parseDayKey(todayKey);
  while (set.has(toKey(d))) {
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

function toKey(date) {
  const p = (n) => (n < 10 ? '0' + n : '' + n);
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

/** Compare two periods of equal length; returns signed % change in total time. */
export function trend(currentTotal, previousTotal) {
  if (!previousTotal) return null;
  return Math.round(((currentTotal - previousTotal) / previousTotal) * 100);
}

export function busiestHour(dist) {
  let max = -1;
  let hour = null;
  dist.forEach((v, h) => { if (v > max) { max = v; hour = h; } });
  return max > 0 ? hour : null;
}

/** Busiest hour-of-day for one domain, from its per-domain hourly map (v2). */
export function domainPeakHour(days, domain) {
  const acc = new Array(24).fill(0);
  let any = false;
  for (const day of Object.values(days)) {
    const rec = day.domains && day.domains[domain];
    if (rec && rec.dh) {
      for (const [h, v] of Object.entries(rec.dh)) { acc[+h] += v || 0; any = true; }
    }
  }
  if (!any) return null;
  let hour = 0;
  let max = -1;
  acc.forEach((v, h) => { if (v > max) { max = v; hour = h; } });
  return max > 0 ? hour : null;
}

/**
 * Plain-language insights comparing the current period to the previous one.
 * Returns [{ key, vars }] for the UI to localize (cat/wd are raw and localized
 * by the caller). Pure — no i18n/DOM here.
 */
export function generateInsights(curDays, prevDays, categoryMap = {}) {
  const out = [];
  const curTotal = totalTime(curDays);
  if (curTotal <= 0) return out;
  const prevTotal = totalTime(prevDays);

  const tr = trend(curTotal, prevTotal);
  if (tr != null && Math.abs(tr) >= 10) {
    out.push({ key: tr > 0 ? 'insight.timeUp' : 'insight.timeDown', vars: { pct: Math.abs(tr) } });
  }

  const cats = byCategory(aggregateDomains(curDays), categoryMap);
  if (cats.length && cats[0].share >= 0.2) {
    out.push({ key: 'insight.topCategory', vars: { cat: cats[0].key, pct: Math.round(cats[0].share * 100) } });
  }

  const score = focusScore(cats);
  const prevScore = focusScore(byCategory(aggregateDomains(prevDays), categoryMap));
  if (score != null && prevScore != null && Math.abs(score - prevScore) >= 5) {
    const d = score - prevScore;
    out.push({ key: d > 0 ? 'insight.focusUp' : 'insight.focusDown', vars: { pts: Math.abs(d) } });
  }

  const byWd = new Array(7).fill(0);
  for (const [key, day] of Object.entries(curDays)) {
    byWd[parseDayKey(key).getDay()] += sum(Object.values(day.domains || {}).map((r) => r.t || 0));
  }
  let maxWd = -1;
  let mx = 0;
  byWd.forEach((v, i) => { if (v > mx) { mx = v; maxWd = i; } });
  if (maxWd >= 0) out.push({ key: 'insight.busiestDay', vars: { wd: maxWd } });

  return out.slice(0, 4);
}
