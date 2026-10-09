// Pure analytics over the day records. Everything here is side-effect free so
// the dashboard can slice the same data many ways cheaply.

import { parseDayKey, sum, dayKey, addDays, startOfWeek } from './utils.js';
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

/**
 * Sum one domain's per-hour-of-day seconds across a set of days, from the
 * per-domain hourly map `dh` (schema v2). Returns a 24-length array, or null if
 * the domain has no hourly data at all (e.g. only pre-v2 records).
 */
export function domainHourly(days, domain) {
  const acc = new Array(24).fill(0);
  let any = false;
  for (const day of Object.values(days)) {
    const rec = day.domains && day.domains[domain];
    if (rec && rec.dh) {
      for (const [h, v] of Object.entries(rec.dh)) {
        const hi = +h;
        if (hi >= 0 && hi < 24) { acc[hi] += v || 0; any = true; }
      }
    }
  }
  return any ? acc : null;
}

/**
 * First and last day-key (within the given ordered keys) on which a domain has
 * any recorded visit. `keys` should be sorted ascending (oldest first), as every
 * caller in this codebase already keeps them. Returns { first, last } of day-keys,
 * or nulls if the domain has no visits in range.
 */
export function firstLastVisit(days, keys, domain) {
  let first = null;
  let last = null;
  for (const key of keys) {
    const rec = days[key] && days[key].domains && days[key].domains[domain];
    if (rec && (rec.v > 0 || rec.t > 0)) {
      if (first == null) first = key;
      last = key;
    }
  }
  return { first, last };
}

/** Busiest hour-of-day for one domain, from its per-domain hourly map (v2). */
export function domainPeakHour(days, domain) {
  const acc = domainHourly(days, domain);
  if (!acc) return null;
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

// ---- session log analytics (opt-in data, see storage.recordSession) ----
// Bucket upper bounds in seconds; the last bucket is open-ended.
const SESSION_BUCKETS = [60, 300, 900, 1800, 3600];
export const SESSION_BUCKET_LABELS = ['<1', '1–5', '5–15', '15–30', '30–60', '60+'];   // minutes

/**
 * Length distribution of the visits to one domain.
 * @param {Record<string, Array<[string, number, number]>>} sessions day key -> [domain, startSec, seconds][]
 */
export function sessionStats(sessions, domain) {
  const out = { count: 0, totalSeconds: 0, average: 0, longest: 0, buckets: new Array(SESSION_BUCKET_LABELS.length).fill(0) };
  for (const list of Object.values(sessions || {})) {
    for (const [d, , seconds] of list) {
      if (d !== domain) continue;
      out.count++;
      out.totalSeconds += seconds;
      out.longest = Math.max(out.longest, seconds);
      let i = SESSION_BUCKETS.findIndex((limit) => seconds < limit);
      if (i < 0) i = SESSION_BUCKETS.length;
      out.buckets[i]++;
    }
  }
  out.average = out.count ? out.totalSeconds / out.count : 0;
  return out;
}

// ---- budgets, weekly focus score, goal streak (v2) ----

/** Seconds per category across a set of day records. */
export function categorySeconds(days, categoryMap = {}) {
  const out = {};
  for (const { domain, t } of Object.values(aggregateDomains(days))) {
    const cat = categorize(domain, categoryMap);
    out[cat] = (out[cat] || 0) + t;
  }
  return out;
}

/**
 * Usage against weekly per-category budgets (minutes), most-used first.
 * @param {Record<string, any>} days  the days of the budget period
 * @param {Record<string, string>} categoryMap
 * @param {Record<string, number>} budgets  category -> minutes
 * @returns {Array<{ key: string, usedSeconds: number, limitSeconds: number, pct: number }>}
 */
export function budgetStatus(days, categoryMap, budgets) {
  const used = categorySeconds(days, categoryMap);
  return Object.entries(budgets || {})
    .filter(([, minutes]) => minutes > 0)
    .map(([key, minutes]) => {
      const usedSeconds = used[key] || 0;
      const limitSeconds = minutes * 60;
      return { key, usedSeconds, limitSeconds, pct: (usedSeconds / limitSeconds) * 100 };
    })
    .sort((a, b) => b.pct - a.pct);
}

/**
 * Focus score for each of the last `weeks` weeks (oldest first, the last entry is the
 * week containing `today`). A week without data has `score: null`.
 * @returns {Array<{ weekKey: string, score: number | null, totalSeconds: number }>}
 */
export function weeklyFocusScores(days, { weekStart = 0, weeks = 12, today = new Date(), categoryMap = {} } = {}) {
  const thisWeek = startOfWeek(today, weekStart);
  const buckets = new Map();
  for (let i = weeks - 1; i >= 0; i--) buckets.set(dayKey(addDays(thisWeek, -7 * i)), {});
  for (const [key, rec] of Object.entries(days)) {
    const bucket = buckets.get(dayKey(startOfWeek(parseDayKey(key), weekStart)));
    if (bucket) bucket[key] = rec;
  }
  return [...buckets].map(([weekKey, weekDays]) => {
    const agg = aggregateDomains(weekDays);
    return { weekKey, score: focusScore(byCategory(agg, categoryMap)), totalSeconds: totalTime(weekDays) };
  });
}

/** The highest-scoring week that has at least `minSeconds` of data (default 30 min), or null. */
export function bestWeek(weeks, minSeconds = 1800) {
  let best = null;
  for (const w of weeks) {
    if (w.score == null || w.totalSeconds < minSeconds) continue;
    if (!best || w.score > best.score) best = w;
  }
  return best;
}

/**
 * Consecutive days (ending today) on which productive time reached `goalSeconds`.
 * Today does not break the streak while it is still short of the goal — the streak
 * then counts back from yesterday.
 */
export function goalStreak(days, goalSeconds, categoryMap, todayKey) {
  if (!(goalSeconds > 0)) return 0;
  const productive = (key) => {
    const day = days[key];
    if (!day) return 0;
    let secs = 0;
    for (const [domain, rec] of Object.entries(day.domains || {})) {
      if (CATEGORY_DEFS[categorize(domain, categoryMap)]?.score > 0) secs += rec.t || 0;
    }
    return secs;
  };
  let cursor = parseDayKey(todayKey);
  if (productive(dayKey(cursor)) < goalSeconds) cursor = addDays(cursor, -1);
  let streak = 0;
  while (productive(dayKey(cursor)) >= goalSeconds) {
    streak++;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

/**
 * Per-site change between two aggregated periods (aggregateDomains output), biggest
 * absolute change first. `a` is the period being examined, `b` the baseline.
 * @returns {Array<{ domain: string, a: number, b: number, delta: number }>}
 */
export function siteChanges(aggA, aggB, limit = 5) {
  const domains = new Set([...Object.keys(aggA || {}), ...Object.keys(aggB || {})]);
  return [...domains]
    .map((domain) => {
      const a = aggA?.[domain]?.t || 0;
      const b = aggB?.[domain]?.t || 0;
      return { domain, a, b, delta: a - b };
    })
    .filter((c) => c.delta !== 0)
    .sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta))
    .slice(0, limit);
}

/**
 * Summary of the focus-session history (see storage.addFocusLog).
 * @param {Array<{ start: number, workedMs: number, endedEarly: boolean }>} log
 * @param {number} [sinceMs]  only count sessions that started at or after this time
 */
export function focusLogStats(log, sinceMs = 0) {
  const sessions = (log || []).filter((e) => e.start >= sinceMs);
  const completed = sessions.filter((e) => !e.endedEarly).length;
  return {
    sessions: sessions.length,
    completed,
    completionRate: sessions.length ? completed / sessions.length : 0,
    totalWorkedMs: sessions.reduce((sum, e) => sum + (e.workedMs || 0), 0),
  };
}
