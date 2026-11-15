// Generating a report from stored data (the worker's scheduled run and the dashboard's "download now")
// and putting it into the folder chosen for backups.
import { getSettings, getDays, getMeta, saveMeta } from './storage.js';
import { rangeKeys, keysBetween, addDays, dayKey, formatDuration } from './utils.js';
import { t, setLang, getLang, dir, locale, categoryLabel } from './i18n.js';
import { buildReport, renderReportHtml, reportPeriod } from './report.js';
import { loadFolderHandle, folderPermission, writeReportToFolder } from './localbackup.js';

/**
 * Build the report for a period. `frequency` picks the period (see reportPeriod); the days before it
 * (same length) give the change figure.
 * @param {'weekly'|'monthly'} frequency
 */
export async function generateReport(frequency, now = new Date()) {
  const settings = await getSettings();
  await setLang(settings.language || 'he');
  const period = reportPeriod(frequency, now, settings.weekStart);
  const days = await getDays(keysBetween(period.from, period.to));
  const prevEnd = addDays(period.from, -1);
  const prevDays = await getDays(rangeKeys(period.days, prevEnd));
  const data = buildReport({ days, prevDays, categoryMap: settings.categoryMap, tags: settings.tags, from: period.from, to: period.to });
  const fmt = new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'short', year: 'numeric' });
  const html = renderReportHtml(data, {
    t, lang: getLang(), dir: dir(), categoryLabel, formatDuration,
    formatDate: (d) => fmt.format(d),
    generatedOn: fmt.format(now),
  });
  return { id: period.id, name: `timetrack-report-${dayKey(period.to)}.html`, html, empty: data.total <= 0 };
}

/**
 * The worker's scheduled run: when a report is due and the backup folder is usable, write it there.
 * Does nothing (and records why) otherwise; a period is only marked done once the file is written.
 */
export async function runScheduledReport(now = new Date()) {
  const settings = await getSettings();
  const frequency = settings.reportFrequency;
  if (frequency !== 'weekly' && frequency !== 'monthly') return { ran: false, reason: 'off' };
  const meta = await getMeta();
  const period = reportPeriod(frequency, now, settings.weekStart);
  if (meta.lastReportId === period.id) return { ran: false, reason: 'done' };

  const handle = await loadFolderHandle();
  if (!handle) { await saveMeta({ lastReportStatus: 'no-folder' }); return { ran: false, reason: 'no-folder' }; }
  if ((await folderPermission(handle)) !== 'granted') { await saveMeta({ lastReportStatus: 'needs-permission' }); return { ran: false, reason: 'needs-permission' }; }

  const report = await generateReport(frequency, now);
  if (report.empty) { await saveMeta({ lastReportId: period.id, lastReportStatus: 'empty' }); return { ran: false, reason: 'empty' }; }
  const r = await writeReportToFolder(handle, report.name, report.html);
  await saveMeta({ lastReportId: period.id, lastReportAt: now.getTime(), lastReportStatus: `ok:${r.name}` });
  return { ran: true, name: r.name };
}
