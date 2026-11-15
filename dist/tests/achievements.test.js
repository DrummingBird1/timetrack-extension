// Achievements: the catalog is pure, unlock dates are kept for good, the streak helper is right.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACHIEVEMENTS, unlockedNow, recordUnlocks } from '../../extension/src/lib/achievements.js';
import { longestStreak } from '../../extension/src/lib/stats.js';

const none = { longestStreak: 0, goalStreak: 0, totalSeconds: 0, focusSessions: 0, bestWeekScore: 0, hasBackup: false };

test('nothing is unlocked on an empty profile, and ids are unique', () => {
  assert.deepEqual(unlockedNow(none), []);
  assert.equal(new Set(ACHIEVEMENTS.map((a) => a.id)).size, ACHIEVEMENTS.length);
});

test('each threshold unlocks exactly when it is reached', () => {
  assert.deepEqual(unlockedNow({ ...none, longestStreak: 7 }), ['streak7']);
  assert.deepEqual(unlockedNow({ ...none, longestStreak: 30 }), ['streak7', 'streak30']);
  assert.deepEqual(unlockedNow({ ...none, goalStreak: 7 }), ['goal7']);
  assert.deepEqual(unlockedNow({ ...none, totalSeconds: 100 * 3600 - 1 }), []);
  assert.deepEqual(unlockedNow({ ...none, totalSeconds: 100 * 3600 }), ['hours100']);
  assert.deepEqual(unlockedNow({ ...none, focusSessions: 10 }), ['focus10']);
  assert.deepEqual(unlockedNow({ ...none, bestWeekScore: 79 }), []);
  assert.deepEqual(unlockedNow({ ...none, bestWeekScore: 80 }), ['score80']);
  assert.deepEqual(unlockedNow({ ...none, hasBackup: true }), ['backup1']);
});

test('recordUnlocks keeps first dates, adds only new ones, and never forgets one that is no longer true', () => {
  const r1 = recordUnlocks({}, ['streak7'], '2026-03-01');
  assert.deepEqual(r1, { merged: { streak7: '2026-03-01' }, added: ['streak7'] });
  const r2 = recordUnlocks(r1.merged, ['streak7', 'backup1'], '2026-03-09');
  assert.deepEqual(r2, { merged: { streak7: '2026-03-01', backup1: '2026-03-09' }, added: ['backup1'] });
  const r3 = recordUnlocks(r2.merged, [], '2026-03-20');          // e.g. a goal streak that has since reset
  assert.deepEqual(r3, { merged: r2.merged, added: [] });
});

test('longestStreak finds the longest run of consecutive days, across month ends and with duplicates', () => {
  assert.equal(longestStreak([]), 0);
  assert.equal(longestStreak(['2026-03-01']), 1);
  assert.equal(longestStreak(['2026-01-30', '2026-01-31', '2026-02-01', '2026-02-02', '2026-02-10', '2026-02-11']), 4);
  assert.equal(longestStreak(['2026-03-03', '2026-03-01', '2026-03-02', '2026-03-02']), 3, 'order and duplicates do not matter');
});
