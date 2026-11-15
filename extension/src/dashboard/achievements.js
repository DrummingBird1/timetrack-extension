// Insights tab: the achievements panel, and a one-time toast when something new is reached.
import { getIndex, getDays, getFocusLog, getMeta, saveMeta } from '../lib/storage.js';
import { isDemoActive } from '../lib/demo.js';
import { dayKey, parseDayKey, esc } from '../lib/utils.js';
import { longestStreak, goalStreak, weeklyFocusScores, bestWeek } from '../lib/stats.js';
import { ACHIEVEMENTS, unlockedNow, recordUnlocks } from '../lib/achievements.js';
import { t, locale } from '../lib/i18n.js';
import { $, settings, toast } from './core.js';

async function buildContext() {
  const idx = await getIndex();
  const days = await getDays(idx);
  let totalSeconds = 0;
  for (const rec of Object.values(days)) for (const d of Object.values(rec.domains || {})) totalSeconds += d.t || 0;
  const goalSeconds = settings.dailyGoalMinutes * 60;
  const recentDays = Object.fromEntries(Object.entries(days).filter(([k]) => idx.slice(-180).includes(k)));
  const weeks = weeklyFocusScores(days, { weekStart: settings.weekStart, weeks: 52, categoryMap: settings.categoryMap });
  return {
    longestStreak: longestStreak(idx),
    goalStreak: goalSeconds > 0 ? goalStreak(recentDays, goalSeconds, settings.categoryMap, dayKey()) : 0,
    totalSeconds,
    focusSessions: (await getFocusLog()).filter((s) => !s.endedEarly).length,
    bestWeekScore: bestWeek(weeks)?.score || 0,
    hasBackup: (settings.backup.lastBackup || 0) > 0,
  };
}

export async function renderAchievements() {
  const host = $('#achievementList');
  const meta = await getMeta();
  let recorded = meta.achievements || {};

  // Demo data is not your history: show the panel, but never record or celebrate from it.
  if (!(await isDemoActive())) {
    const { merged, added } = recordUnlocks(recorded, unlockedNow(await buildContext()), dayKey());
    if (added.length) {
      await saveMeta({ achievements: merged });
      const first = ACHIEVEMENTS.find((a) => a.id === added[0]);
      toast(t('ach.toast', { n: t(`ach.${first.kind}.name`, { n: first.n }) }), 'success');
    }
    recorded = merged;
  }

  host.innerHTML = '';
  for (const a of ACHIEVEMENTS) {
    const when = recorded[a.id];
    const li = document.createElement('li');
    li.className = `ach${when ? ' on' : ''}`;
    const date = when ? parseDayKey(when).toLocaleDateString(locale(), { day: 'numeric', month: 'short', year: 'numeric' }) : '';
    li.innerHTML = `<div class="ach-name">${esc(t(`ach.${a.kind}.name`, { n: a.n }))}</div>
      <div class="ach-desc">${esc(t(`ach.${a.kind}.desc`, { n: a.n }))}</div>
      <div class="ach-state">${esc(when ? t('ach.unlockedOn', { d: date }) : t('ach.locked'))}</div>`;
    host.appendChild(li);
  }
}
