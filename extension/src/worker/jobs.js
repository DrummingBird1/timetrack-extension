// The hourly jobs: auto backup, the weekly summary, the stale-backup warning and the scheduled report.
// Part of the service worker; background.js owns the event wiring.

import { getDays, getMeta, getSettings, saveMeta, saveSettings } from '../lib/storage.js';
import { addDays, dayKey, formatDuration, rangeKeys } from '../lib/utils.js';
import { backupStaleDays, hasBackupTarget, runAutoBackup } from '../lib/backup.js';
import { runScheduledReport } from '../lib/reportjob.js';
import { aggregateDomains, byCategory, focusScore, topSites, totalTime } from '../lib/stats.js';
import { setLang, t } from '../lib/i18n.js';
import { markNotified, maybeStorageWarning, notifiedSet, notify } from './notifications.js';

// Auto-backup, the weekly summary and the storage warning. Run from the 60-minute alarm and, as a
// safety net, from the 1-minute tick (throttled by meta.lastHourlyJobs).
const HOURLY_MS = 60 * 60 * 1000;
export async function runHourlyJobs({ force = false } = {}) {
  if (!force) {
    const meta = await getMeta();
    if (Date.now() - (meta.lastHourlyJobs || 0) < HOURLY_MS - 30000) return;
  }
  await saveMeta({ lastHourlyJobs: Date.now() });
  await maybeAutoBackup();
  await maybeWeeklySummary();
  await runScheduledReport().catch(() => {});     // a report that can't be written is retried at the next hourly run
  await maybeStorageWarning(await getSettings());
}

// Fires once on the configured first day of the week, summarizing the prior 7
// days. Deduped via meta.lastWeeklySummary so the hourly alarm can't repeat it.
async function maybeWeeklySummary() {
  const settings = await getSettings();
  if (!settings.weeklySummary) return;
  if (new Date().getDay() !== settings.weekStart) return;
  const meta = await getMeta();
  if (Date.now() - (meta.lastWeeklySummary || 0) < 6 * 86400000) return;
  await setLang(settings.language || 'he');

  const keys = rangeKeys(7, addDays(new Date(), -1)); // previous 7 days
  const days = await getDays(keys);
  const total = totalTime(days);
  if (total <= 0) return;
  const agg = aggregateDomains(days);
  const top = topSites(agg, 1)[0];
  const score = focusScore(byCategory(agg, settings.categoryMap));
  const parts = [t('notif.weekly.total', { v: formatDuration(total) })];
  if (top) parts.push(t('notif.weekly.top', { d: top.domain }));
  if (score != null) parts.push(t('notif.weekly.focus', { n: score }));
  notify(t('notif.weekly.title'), parts.join(' • '));
  await saveMeta({ lastWeeklySummary: Date.now() });
}

async function maybeAutoBackup() {
  let settings = await getSettings();
  const b = settings.backup;
  if (!hasBackupTarget(b)) return;
  const dueAfter = (b.autoIntervalHours || 24) * 3600 * 1000;
  if (Date.now() - (b.lastBackup || 0) >= dueAfter) {
    try {
      await runAutoBackup();
    } catch (e) {
      // Not stamping lastBackup: a failed attempt must not look like a fresh backup, and the next hourly run retries.
      await saveSettings({ backup: { lastBackupStatus: `⚠️ ${e.message}` } });
    }
    settings = await getSettings();
  }
  await warnIfBackupStale(settings);
}

/** One notification a day while a configured backup keeps failing (or never ran) for backupWarnDays. */
async function warnIfBackupStale(settings) {
  const days = backupStaleDays(settings, (await getMeta()).installedAt);
  if (!days) return;
  const key = `backupstale:${dayKey()}`;
  if ((await notifiedSet())[key]) return;
  await setLang(settings.language || 'he');
  notify(t('notif.backupStale.title'), t('notif.backupStale.body', { n: days }));
  await markNotified(key);
}
