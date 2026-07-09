// TimeTrack service worker — the time-tracking engine.
//
// It keeps a single "current segment" (which domain is being watched and since
// when). On any relevant browser event it commits the elapsed time of the
// previous segment, then re-evaluates what should be tracked now. Counting only
// happens while the window is focused, the user is not idle, and the domain is
// trackable. State survives SW restarts via chrome.storage.session.

import {
  getSettings, saveSettings, addTime, addVisit, getDay, getDays, pruneOld,
  saveMeta, getMeta, migrate,
} from './src/lib/storage.js';
import { domainFromUrl, dayKey, rangeKeys, addDays, formatDuration } from './src/lib/utils.js';
import { runAutoBackup } from './src/lib/backup.js';
import { categorize } from './src/lib/categories.js';
import { aggregateDomains, totalTime, topSites, byCategory, focusScore } from './src/lib/stats.js';

const SESSION_STATE = 'ttt_state';
const FOCUS_STATE = 'ttt_focus';
const NOTIFIED = 'ttt_notified';
const TICK_ALARM = 'ttt_tick';
const BACKUP_ALARM = 'ttt_backup';

// The worker is ephemeral: it cold-starts on most ticks, so a segment is
// normally committed within ~60s. We cap the credit per commit so a long
// dormancy (laptop sleep, browser closed) can't be mistaken for active time.
const MAX_SEGMENT_SECONDS = 120;

// ---- tiny mutex so overlapping events never double-commit a segment ----
// The chain always advances (errors are caught + logged) so one failure can't
// wedge tracking, but the caller still sees rejections from their own call.
let chain = Promise.resolve();
function locked(fn) {
  const run = chain.then(() => fn());
  chain = run.catch((e) => { console.warn('[TimeTrack] tracking error:', e); });
  return run;
}

// ---- session state ----
let state = null;
async function loadState() {
  if (state) return state;
  const r = await chrome.storage.session.get(SESSION_STATE);
  state = r[SESSION_STATE] || {
    domain: null, since: 0, counting: false, lastDomain: null,
    focused: true, idle: false, audible: false,
  };
  return state;
}
async function saveState() {
  await chrome.storage.session.set({ [SESSION_STATE]: state });
}

// ---- focus mode (Pomodoro + site blocking) ----
// The session snapshots its rules at start so editing settings mid-session
// doesn't change an in-flight session. It runs work→break cycles; blocking is
// enforced only during 'work' phases (block-list or allow-list mode).
async function loadFocus() {
  const r = await chrome.storage.session.get(FOCUS_STATE);
  return r[FOCUS_STATE] || { active: false, endsAt: 0, phase: 'work' };
}
async function saveFocus(focus) {
  await chrome.storage.session.set({ [FOCUS_STATE]: focus });
}
function sessionLive(focus) {
  return !!(focus && focus.active && Date.now() < focus.endsAt);
}
function blockingLive(focus) {
  return sessionLive(focus) && focus.phase === 'work';
}
function isBlocked(domain, settings, focus) {
  if (!domain || !blockingLive(focus)) return false;
  if (focus.mode === 'allow') {
    if ((focus.allowDomains || []).includes(domain)) return false;
    if ((focus.allowCategories || []).includes(categorize(domain, settings.categoryMap))) return false;
    return true; // allow-list: block everything not explicitly allowed
  }
  if ((focus.blockDomains || []).includes(domain)) return true;
  return (focus.blockCategories || []).includes(categorize(domain, settings.categoryMap));
}
const BLOCK_PAGE = chrome.runtime.getURL('src/blocked/blocked.html');
const SELF_PREFIX = chrome.runtime.getURL('');

async function enforceFocusOnTab(tabId, url, settings, focus) {
  if (!blockingLive(focus) || !url || url.startsWith(SELF_PREFIX)) return;
  const domain = domainFromUrl(url, settings.groupSubdomains);
  if (isBlocked(domain, settings, focus)) {
    try {
      await chrome.tabs.update(tabId, { url: `${BLOCK_PAGE}?d=${encodeURIComponent(domain)}` });
    } catch { /* tab may be gone */ }
  }
}

async function enforceAllTabs(settings, focus) {
  if (!blockingLive(focus)) return;
  try {
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      if (tab.id && tab.url) await enforceFocusOnTab(tab.id, tab.url, settings, focus);
    }
  } catch { /* tabs permission edge */ }
}

function focusView(focus) {
  return {
    active: sessionLive(focus),
    phase: focus.phase || 'work',
    endsAt: focus.endsAt || 0,
    remaining: sessionLive(focus) ? Math.max(0, (focus.endsAt - Date.now()) / 1000) : 0,
    cycle: (focus.cycle || 0) + 1,
    totalCycles: focus.totalCycles || 1,
  };
}

/** Advance the Pomodoro state machine when a phase ends. Returns current focus. */
async function checkFocusExpiry() {
  const focus = await loadFocus();
  if (!focus.active || Date.now() < focus.endsAt) return focus;

  if (focus.phase === 'work') {
    const moreCycles = (focus.cycle || 0) + 1 < (focus.totalCycles || 1);
    if (moreCycles && focus.breakMs > 0) {
      focus.phase = 'break';
      focus.endsAt = Date.now() + focus.breakMs;
      await saveFocus(focus);
      notify('הפסקה ☕', `${Math.round(focus.breakMs / 60000)} דקות הפסקה. נתראה בסבב הבא.`);
      return focus;
    }
    if (moreCycles) {
      focus.cycle += 1;
      focus.endsAt = Date.now() + focus.workMs;
      await saveFocus(focus);
      await enforceAllTabs(await getSettings(), focus);
      return focus;
    }
    focus.active = false;
    await saveFocus(focus);
    notify('סשן הפוקוס הושלם 🎉', 'כל הכבוד! חזרת לגלישה רגילה.');
    return focus;
  }

  // break ended → next work cycle
  focus.cycle = (focus.cycle || 0) + 1;
  focus.phase = 'work';
  focus.endsAt = Date.now() + focus.workMs;
  await saveFocus(focus);
  notify('חזרה לעבודה 🧘', 'סבב פוקוס חדש התחיל.');
  await enforceAllTabs(await getSettings(), focus);
  return focus;
}

async function queryActive(settings) {
  try {
    const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    const tab = tabs && tabs[0];
    if (!tab) return { domain: null, audible: false };
    return {
      domain: domainFromUrl(tab.url || tab.pendingUrl, settings.groupSubdomains),
      audible: !!tab.audible,
    };
  } catch {
    return { domain: null, audible: false };
  }
}

function shouldCount(settings, st, info) {
  if (!settings.enabled) return false;
  if (!info.domain) return false;
  if (settings.blacklist.includes(info.domain)) return false;
  const active = st.focused && !st.idle;
  if (active) return true;
  // Background audio keeps counting only if the user opted in.
  if (settings.countAudibleBackground && info.audible) return true;
  return false;
}

/** Commit the open segment, then start a fresh one for the current context. */
async function refresh() {
  return locked(async () => {
    const settings = await getSettings();
    const st = await loadState();
    const now = Date.now();

    // 1) Commit elapsed time for the segment that was open. Capped so a missed
    //    heartbeat (sleep/dormancy) credits at most MAX_SEGMENT_SECONDS.
    if (st.counting && st.domain && st.since) {
      const elapsed = Math.min((now - st.since) / 1000, MAX_SEGMENT_SECONDS);
      if (elapsed >= 1) {
        const when = new Date(st.since);
        await addTime({ dateKey: dayKey(when), domain: st.domain, seconds: elapsed, hour: when.getHours() });
      }
    }

    // 2) Figure out the new context.
    const info = await queryActive(settings);
    const counting = shouldCount(settings, st, info);

    if (counting && info.domain && info.domain !== st.lastDomain) {
      await addVisit(dayKey(new Date(now)), info.domain);
      st.lastDomain = info.domain;
    }

    st.domain = info.domain;
    st.audible = info.audible;
    st.counting = counting;
    st.since = now;
    await saveState();

    // 3) Limits / goals / focus expiry.
    await checkLimits(settings, info.domain);
    await checkFocusExpiry();
    updateBadge(settings, counting);
  });
}

function updateBadge(settings, counting) {
  try {
    chrome.action.setBadgeBackgroundColor({ color: counting ? '#22c55e' : '#64748b' });
    chrome.action.setBadgeText({ text: settings.enabled ? '' : '⏸' });
  } catch { /* action may be unavailable */ }
}

// ---- limit notifications (deduped per day) ----
async function notifiedSet() {
  const r = await chrome.storage.session.get(NOTIFIED);
  return r[NOTIFIED] || {};
}
async function markNotified(key) {
  const set = await notifiedSet();
  set[key] = true;
  await chrome.storage.session.set({ [NOTIFIED]: set });
}

async function checkLimits(settings, domain) {
  if (!settings.notifyLimits) return;
  const today = dayKey();
  const day = await getDay(today);
  if (!day) return;
  const set = await notifiedSet();

  let total = 0;
  for (const rec of Object.values(day.domains)) total += rec.t || 0;

  if (settings.dailyLimitMinutes > 0) {
    const k = `daily:${today}`;
    if (!set[k] && total >= settings.dailyLimitMinutes * 60) {
      notify('הגעת למגבלת הזמן היומית', `עברת ${settings.dailyLimitMinutes} דקות גלישה היום.`);
      await markNotified(k);
    }
  }
  if (domain && settings.siteLimits[domain] > 0) {
    const used = day.domains[domain]?.t || 0;
    const k = `site:${today}:${domain}`;
    if (!set[k] && used >= settings.siteLimits[domain] * 60) {
      notify('מגבלת אתר הושגה', `${domain}: עברת ${settings.siteLimits[domain]} דקות היום.`);
      await markNotified(k);
    }
  }
}

function notify(title, message) {
  try {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icons/icon128.png'),
      title,
      message,
      priority: 1,
    });
  } catch { /* notifications permission may be revoked */ }
}

// ---- idle detection ----
async function applyIdleInterval() {
  const settings = await getSettings();
  const secs = Math.max(15, settings.idleSeconds | 0);
  chrome.idle.setDetectionInterval(secs);
}

// ---- event wiring ----
chrome.tabs.onActivated.addListener(() => refresh());

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.url) {
    const settings = await getSettings();
    const focus = await loadFocus();
    await enforceFocusOnTab(tabId, changeInfo.url, settings, focus);
  }
  if (tab.active && (changeInfo.url || changeInfo.status === 'complete' || changeInfo.audible !== undefined)) {
    refresh();
  }
});

chrome.tabs.onRemoved.addListener(() => refresh());

chrome.windows.onFocusChanged.addListener(async (winId) => {
  const st = await loadState();
  st.focused = winId !== chrome.windows.WINDOW_ID_NONE;
  await saveState();
  refresh();
});

chrome.idle.onStateChanged.addListener(async (newState) => {
  const st = await loadState();
  st.idle = newState !== 'active';
  await saveState();
  refresh();
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === TICK_ALARM) {
    await refresh(); // periodic commit so long sessions aren't lost
  } else if (alarm.name === BACKUP_ALARM) {
    await maybeAutoBackup();
    await maybeWeeklySummary();
  }
});

// Fires once on the configured first day of the week, summarizing the prior 7
// days. Deduped via meta.lastWeeklySummary so the hourly alarm can't repeat it.
async function maybeWeeklySummary() {
  const settings = await getSettings();
  if (!settings.weeklySummary) return;
  if (new Date().getDay() !== settings.weekStart) return;
  const meta = await getMeta();
  if (Date.now() - (meta.lastWeeklySummary || 0) < 6 * 86400000) return;

  const keys = rangeKeys(7, addDays(new Date(), -1)); // previous 7 days
  const days = await getDays(keys);
  const total = totalTime(days);
  if (total <= 0) return;
  const agg = aggregateDomains(days);
  const top = topSites(agg, 1)[0];
  const score = focusScore(byCategory(agg, settings.categoryMap));
  const parts = [`סה״כ ${formatDuration(total)}`];
  if (top) parts.push(`מוביל: ${top.domain}`);
  if (score != null) parts.push(`פוקוס: ${score}/100`);
  notify('סיכום השבוע שלך 📊', parts.join(' • '));
  await saveMeta({ lastWeeklySummary: Date.now() });
}

async function maybeAutoBackup() {
  const settings = await getSettings();
  const b = settings.backup;
  if (!b.syncEnabled && !b.endpointUrl) return;
  const dueAfter = (b.autoIntervalHours || 24) * 3600 * 1000;
  if (Date.now() - (b.lastBackup || 0) < dueAfter) return;
  try {
    await runAutoBackup();
  } catch (e) {
    await saveSettings({ backup: { lastBackupStatus: `⚠️ ${e.message}`, lastBackup: Date.now() } });
  }
}

async function init() {
  await migrate();
  await applyIdleInterval();
  const st = await loadState();
  // Re-sync focus/idle on startup.
  try {
    const win = await chrome.windows.getLastFocused();
    st.focused = !!win && win.focused;
  } catch { st.focused = true; }
  try {
    const idleState = await chrome.idle.queryState(Math.max(15, (await getSettings()).idleSeconds | 0));
    st.idle = idleState !== 'active';
  } catch { st.idle = false; }
  // NOTE: do NOT reset st.since here. init() re-runs on every cold start, and
  // the open segment's elapsed time (since the last commit) must be credited by
  // the refresh() below — not discarded. A first-ever run has since=0 and
  // counting=false, so nothing is committed then.
  if (!st.since) st.since = Date.now();
  await saveState();

  chrome.alarms.create(TICK_ALARM, { periodInMinutes: 1 });
  chrome.alarms.create(BACKUP_ALARM, { periodInMinutes: 60 });

  const settings = await getSettings();
  await pruneOld(settings.retentionDays);
  refresh();
}

chrome.runtime.onStartup.addListener(init);
chrome.runtime.onInstalled.addListener(async (details) => {
  const meta = await getMeta();
  if (!meta.installedAt) await saveMeta({ installedAt: Date.now() });
  if (details.reason === 'install') {
    chrome.tabs.create({ url: chrome.runtime.getURL('src/dashboard/dashboard.html#welcome') });
  }
  await init();
});

// ---- messaging (popup + dashboard) ----
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  handleMessage(msg).then(sendResponse).catch((e) => sendResponse({ error: e.message }));
  return true; // async
});

async function handleMessage(msg) {
  switch (msg.type) {
    case 'getLive': {
      await refresh();
      const st = await loadState();
      const settings = await getSettings();
      const today = await getDay(dayKey());
      let live = 0;
      if (st.counting && st.domain && st.since) live = (Date.now() - st.since) / 1000;
      return {
        enabled: settings.enabled,
        counting: st.counting,
        currentDomain: st.domain,
        liveSeconds: live,
        today: today || { domains: {}, hours: new Array(24).fill(0) },
      };
    }
    case 'setEnabled': {
      const settings = await saveSettings({ enabled: !!msg.value });
      await refresh();
      updateBadge(settings, false);
      return { enabled: settings.enabled };
    }
    case 'settingsChanged': {
      await applyIdleInterval();
      await refresh();
      return { ok: true };
    }
    case 'flush': {
      await refresh();
      return { ok: true };
    }
    case 'runBackup': {
      const r = await runAutoBackup();
      return r;
    }
    case 'prune': {
      const settings = await getSettings();
      const removed = await pruneOld(settings.retentionDays);
      return { removed };
    }
    case 'getFocus': {
      return focusView(await checkFocusExpiry());
    }
    case 'startFocus': {
      return startFocusSession(msg.minutes);
    }
    case 'stopFocus': {
      const focus = await loadFocus();
      focus.active = false;
      await saveFocus(focus);
      return { active: false };
    }
    default:
      return { ok: false, unknown: true };
  }
}

async function startFocusSession(minutesArg) {
  const settings = await getSettings();
  const f = settings.focus;
  const workMin = Math.max(1, Math.min(240, minutesArg || f.defaultMinutes || 25));
  const focus = {
    active: true,
    phase: 'work',
    cycle: 0,
    totalCycles: Math.max(1, Math.min(12, f.cycles || 1)),
    workMs: workMin * 60000,
    breakMs: Math.max(0, Math.min(60, f.breakMinutes || 0)) * 60000,
    endsAt: Date.now() + workMin * 60000,
    mode: f.mode === 'allow' ? 'allow' : 'block',
    blockCategories: f.blockCategories || [],
    blockDomains: f.blockDomains || [],
    allowCategories: f.allowCategories || [],
    allowDomains: f.allowDomains || [],
  };
  await saveFocus(focus);
  await enforceAllTabs(settings, focus);
  const cyc = focus.totalCycles > 1 ? ` (${focus.totalCycles} סבבים)` : '';
  notify('מצב פוקוס הופעל 🧘', `נחסום הסחות דעת ל-${workMin} דקות${cyc}. בהצלחה!`);
  return focusView(focus);
}

// ---- keyboard shortcuts (chrome.commands) ----
chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'toggle-tracking') {
    const settings = await getSettings();
    const next = await saveSettings({ enabled: !settings.enabled });
    await refresh();
    updateBadge(next, false);
    notify('TimeTrack', next.enabled ? 'המעקב הופעל' : 'המעקב הושהה');
  } else if (command === 'start-focus') {
    const focus = await loadFocus();
    if (sessionLive(focus)) { focus.active = false; await saveFocus(focus); notify('TimeTrack', 'סשן הפוקוס הסתיים'); }
    else await startFocusSession();
  } else if (command === 'open-dashboard') {
    chrome.runtime.openOptionsPage();
  }
});

// Kick things off when the worker first loads.
init();
