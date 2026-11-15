// Focus-session state helpers: load/save, "is blocking live", "is this domain blocked", and the popup view.
// Part of the service worker; background.js owns the event wiring.

import { categorize } from '../lib/categories.js';

const FOCUS_STATE = 'ttt_focus';
// ---- focus mode (Pomodoro + site blocking) ----
// The session snapshots its rules at start so editing settings mid-session
// doesn't change an in-flight session. It runs work→break cycles; blocking is
// enforced only during 'work' phases (block-list or allow-list mode).
export async function loadFocus() {
  const r = await chrome.storage.session.get(FOCUS_STATE);
  return r[FOCUS_STATE] || { active: false, endsAt: 0, phase: 'work' };
}
export async function saveFocus(focus) {
  await chrome.storage.session.set({ [FOCUS_STATE]: focus });
}
export function sessionLive(focus) {
  return !!(focus && focus.active && Date.now() < focus.endsAt);
}
export function blockingLive(focus) {
  const paused = focus.pausedUntil && Date.now() < focus.pausedUntil;     // "allow 10 minutes" on the block page
  return sessionLive(focus) && focus.phase === 'work' && !paused;
}
export function isBlocked(domain, settings, focus) {
  if (!domain || !blockingLive(focus)) return false;
  if (focus.mode === 'allow') {
    if ((focus.allowDomains || []).includes(domain)) return false;
    if ((focus.allowCategories || []).includes(categorize(domain, settings.categoryMap))) return false;
    return true; // allow-list: block everything not explicitly allowed
  }
  if ((focus.blockDomains || []).includes(domain)) return true;
  return (focus.blockCategories || []).includes(categorize(domain, settings.categoryMap));
}
export function focusView(focus) {
  return {
    active: sessionLive(focus),
    phase: focus.phase || 'work',
    endsAt: focus.endsAt || 0,
    remaining: sessionLive(focus) ? Math.max(0, (focus.endsAt - Date.now()) / 1000) : 0,
    cycle: (focus.cycle || 0) + 1,
    totalCycles: focus.totalCycles || 1,
    strict: !!focus.strict,
    pausedUntil: focus.pausedUntil || 0,
  };
}
