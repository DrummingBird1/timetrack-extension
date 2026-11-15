// Weekly / monthly report: a self-contained HTML page (no scripts, no external requests) built from
// the tracked days. Pure — the translation function, formatters and date helpers are passed in, so
// it runs the same in the service worker (scheduled), the dashboard (download now) and tests.
import { addDays, dayKey, esc, startOfWeek } from './utils.js';
import {
  totalTime, activeDaysCount, topSites, aggregateDomains, byCategory, focusScore, trend, tagSeconds,
} from './stats.js';

/**
 * The period a scheduled report covers and an id that is the same for every run within it.
 * weekly: the 7 days ending yesterday. monthly: the previous calendar month.
 * @param {'weekly'|'monthly'} frequency
 * @returns {{ id: string, from: Date, to: Date, days: number }}
 */
export function reportPeriod(frequency, today = new Date(), weekStart = 0) {
  if (frequency === 'monthly') {
    const first = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const last = new Date(today.getFullYear(), today.getMonth(), 0);
    return { id: `M:${today.getFullYear()}-${today.getMonth() + 1}`, from: first, to: last, days: last.getDate() };
  }
  const to = addDays(new Date(today.getFullYear(), today.getMonth(), today.getDate()), -1);
  return { id: `W:${dayKey(startOfWeek(today, weekStart))}`, from: addDays(to, -6), to, days: 7 };
}

/** The numbers behind a report. `days` and `prevDays` are day-key -> record maps for the period and the one before it. */
export function buildReport({ days, prevDays, categoryMap = {}, tags = {}, from, to }) {
  const total = totalTime(days);
  const active = activeDaysCount(days);
  const cats = byCategory(aggregateDomains(days), categoryMap);
  return {
    from, to,
    total,
    activeDays: active,
    avgPerActiveDay: active ? total / active : 0,
    deltaPct: trend(total, totalTime(prevDays)),
    focus: focusScore(cats),
    sites: topSites(aggregateDomains(days), 10),
    categories: cats.slice(0, 8),
    tags: tagSeconds(days, tags),
  };
}

/**
 * @param {ReturnType<typeof buildReport>} r
 * @param {{ t: (k: string, v?: any) => string, lang: string, dir: string, categoryLabel: (k: string) => string,
 *   formatDuration: (s: number) => string, formatDate: (d: Date) => string, generatedOn: string }} env
 */
export function renderReportHtml(r, env) {
  const { t, lang, dir, categoryLabel, formatDuration, formatDate } = env;
  const rows = (items) => items.map(([a, b]) => `<tr><td>${esc(a)}</td><td class="n">${esc(b)}</td></tr>`).join('');
  const delta = r.deltaPct == null ? '' : ` <span class="d">${r.deltaPct > 0 ? '▲' : r.deltaPct < 0 ? '▼' : '•'} ${Math.abs(r.deltaPct)}% ${esc(t('delta.prev'))}</span>`;
  const section = (title, items) => (items.length
    ? `<h2>${esc(title)}</h2><table>${rows(items)}</table>` : '');
  return `<!doctype html>
<html lang="${esc(lang)}" dir="${esc(dir)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(t('report.title'))} ${esc(formatDate(r.from))} – ${esc(formatDate(r.to))}</title>
<style>
:root{color-scheme:light dark;--bg:#fff;--fg:#14171f;--dim:#4b5563;--line:#d7dbe3;--accent:#4338ca}
@media (prefers-color-scheme:dark){:root{--bg:#10131a;--fg:#e8eaf0;--dim:#a3a9b8;--line:#2b3140;--accent:#a5b4fc}}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,sans-serif}
main{max-width:720px;margin:0 auto;padding:24px 16px}
h1{font-size:22px;margin:0 0 4px}h2{font-size:16px;margin:24px 0 8px}
.sub,.d,footer{color:var(--dim);font-size:13px}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-top:16px}
.card{border:1px solid var(--line);border-radius:12px;padding:12px}.card b{display:block;font-size:20px;color:var(--accent)}
table{width:100%;border-collapse:collapse}td{padding:6px 0;border-bottom:1px solid var(--line)}td.n{text-align:end;white-space:nowrap}
</style></head><body><main>
<h1>${esc(t('report.title'))}</h1>
<div class="sub">${esc(formatDate(r.from))} – ${esc(formatDate(r.to))}</div>
<div class="cards">
<div class="card"><b>${esc(formatDuration(r.total))}</b>${esc(t('report.total'))}${delta}</div>
<div class="card"><b>${esc(formatDuration(r.avgPerActiveDay))}</b>${esc(t('report.avg'))}</div>
<div class="card"><b>${r.activeDays}</b>${esc(t('report.activeDays'))}</div>
<div class="card"><b>${r.focus == null ? '—' : r.focus}</b>${esc(t('report.focus'))}</div>
</div>
${section(t('report.topSites'), r.sites.map((s) => [s.domain, formatDuration(s.t)]))}
${section(t('report.categories'), r.categories.map((c) => [categoryLabel(c.key), `${formatDuration(c.t)} · ${Math.round(c.share * 100)}%`]))}
${section(t('report.tags'), r.tags.map((x) => [x.tag, formatDuration(x.seconds)]))}
<footer><p>${esc(t('report.footer', { d: env.generatedOn }))}</p></footer>
</main></body></html>
`;
}
