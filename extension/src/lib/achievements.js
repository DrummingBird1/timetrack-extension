// Achievements: small, local milestones derived from your own history. Nothing here leaves the
// device and nothing is compared with anyone — it is a way to notice habits, not a game server.
// The catalog is pure; the dashboard remembers the day each one was first reached (meta.achievements).

/**
 * What the catalog looks at. Everything is computed from data already on this device.
 * @typedef {{
 *   longestStreak: number,     // longest run of consecutive tracked days, ever
 *   goalStreak: number,        // current run of days that met the daily goal (0 when no goal is set)
 *   totalSeconds: number,      // all tracked time
 *   focusSessions: number,     // finished focus sessions that were not ended early
 *   bestWeekScore: number,     // best weekly focus score (0 when there is no week with enough data)
 *   hasBackup: boolean,        // at least one successful backup
 * }} AchievementContext
 */

/**
 * kind picks the translated name/description template (ach.<kind>.name / .desc), n fills {n}.
 * @type {Array<{ id: string, kind: string, n: number, test: (c: AchievementContext) => boolean }>}
 */
export const ACHIEVEMENTS = [
  { id: 'streak7', kind: 'streak', n: 7, test: (c) => c.longestStreak >= 7 },
  { id: 'streak30', kind: 'streak', n: 30, test: (c) => c.longestStreak >= 30 },
  { id: 'streak100', kind: 'streak', n: 100, test: (c) => c.longestStreak >= 100 },
  { id: 'goal7', kind: 'goal', n: 7, test: (c) => c.goalStreak >= 7 },
  { id: 'goal30', kind: 'goal', n: 30, test: (c) => c.goalStreak >= 30 },
  { id: 'hours100', kind: 'hours', n: 100, test: (c) => c.totalSeconds >= 100 * 3600 },
  { id: 'hours1000', kind: 'hours', n: 1000, test: (c) => c.totalSeconds >= 1000 * 3600 },
  { id: 'focus10', kind: 'focus', n: 10, test: (c) => c.focusSessions >= 10 },
  { id: 'focus50', kind: 'focus', n: 50, test: (c) => c.focusSessions >= 50 },
  { id: 'score80', kind: 'score', n: 80, test: (c) => c.bestWeekScore >= 80 },
  { id: 'backup1', kind: 'backup', n: 1, test: (c) => c.hasBackup },
];

/** Ids reached right now, in catalog order. */
export function unlockedNow(ctx) {
  return ACHIEVEMENTS.filter((a) => a.test(ctx)).map((a) => a.id);
}

/**
 * Merge what is reached now into what was recorded before. Reached achievements keep their
 * first date for good, even if the number behind them later drops (a goal streak resets).
 * @param {Record<string, string>} recorded  id -> day key
 * @param {string[]} reachedNow
 * @param {string} today  day key
 * @returns {{ merged: Record<string, string>, added: string[] }}
 */
export function recordUnlocks(recorded, reachedNow, today) {
  const merged = { ...recorded };
  const added = [];
  for (const id of reachedNow) {
    if (!(id in merged)) { merged[id] = today; added.push(id); }
  }
  return { merged, added };
}
