// TimeTrack service worker — the time-tracking engine.
//
// It keeps a single "current segment" (which domain is being watched and since
// when). On any relevant browser event it commits the elapsed time of the
// previous segment, then re-evaluates what should be tracked now. Counting only
// happens while the window is focused, the user is not idle, and the domain is
// trackable. State survives SW restarts via chrome.storage.session.

import {
  getSettings, saveSettings, addTime, addVisit, getDay, getDays, pruneOld,
  saveMeta, getMeta, migrate, storageFootprint,
} from './src/lib/storage.js';
import { domainFromUrl, dayKey, rangeKeys, addDays, formatDuration } from './src/lib/utils.js';
import { runAutoBackup } from './src/lib/backup.js';
import { categorize } from './src/lib/categories.js';
import { aggregateDomains, totalTime, topSites, byCategory, focusScore } from './src/lib/stats.js';
import { setLang, t } from './src/lib/i18n.js';

const SESSION_STATE = 'ttt_state';
const FOCUS_STATE = 'ttt_focus';
const NOTIFIED = 'ttt_notified';
const SNOOZED = 'ttt_snoozed';
const TICK_ALARM = 'ttt_tick';
const BACKUP_ALARM = 'ttt_backup';
const SNOOZE_MS = 60 * 60 * 1000;              // "+1h" snooze button on limit notifications
const STORAGE_WARN_BYTES = 250 * 1024 * 1024;  // soft heads-up threshold (unlimitedStorage has no hard extension cap, but disk is still finite)

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
  const settings = await getSettings();
  setLang(settings.language || 'he');

  if (focus.phase === 'work') {
    const completed = (focus.cycle || 0) + 1;      // work cycles finished so far
    const moreCycles = completed < (focus.totalCycles || 1);
    // Every Nth cycle earns a longer break, when configured.
    const isLong = focus.longBreakMs > 0 && focus.longBreakEvery > 0
      && completed % focus.longBreakEvery === 0;
    const breakMs = isLong ? focus.longBreakMs : focus.breakMs;
    if (moreCycles && breakMs > 0) {
      focus.phase = 'break';
      focus.endsAt = Date.now() + breakMs;
      await saveFocus(focus);
      const mins = Math.round(breakMs / 60000);
      notify(isLong ? t('notif.longBreak.title') : t('notif.break.title'), t('notif.break.body', { m: mins }));
      return focus;
    }
    if (moreCycles) {
      focus.cycle += 1;
      focus.endsAt = Date.now() + focus.workMs;
      await saveFocus(focus);
      await enforceAllTabs(settings, focus);
      return focus;
    }
    focus.active = false;
    await saveFocus(focus);
    notify(t('notif.focusComplete.title'), t('notif.focusComplete.body'));
    return focus;
  }

  // break ended → next work cycle
  focus.cycle = (focus.cycle || 0) + 1;
  focus.phase = 'work';
  focus.endsAt = Date.now() + focus.workMs;
  await saveFocus(focus);
  notify(t('notif.workResume.title'), t('notif.workResume.body'));
  await enforceAllTabs(settings, focus);
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

// ---- limit notifications (deduped per day, snoozable) ----
async function notifiedSet() {
  const r = await chrome.storage.session.get(NOTIFIED);
  return r[NOTIFIED] || {};
}
async function markNotified(key) {
  const set = await notifiedSet();
  set[key] = true;
  await chrome.storage.session.set({ [NOTIFIED]: set });
}

async function snoozedSet() {
  const r = await chrome.storage.session.get(SNOOZED);
  return r[SNOOZED] || {};
}
async function isSnoozedKey(key) {
  const set = await snoozedSet();
  return !!(set[key] && Date.now() < set[key]);
}
async function setSnoozeKey(key) {
  const set = await snoozedSet();
  set[key] = Date.now() + SNOOZE_MS;
  await chrome.storage.session.set({ [SNOOZED]: set });
}

/**
 * Checks the daily and per-site limits, firing an 80%-approaching warning and a
 * 100%-reached notification (each deduped once per day via `notified`). A limit
 * key can be snoozed for an hour from either notification's button, which
 * suppresses both the warning and the reached notification for that key.
 */
async function checkLimits(settings, domain) {
  if (!settings.notifyLimits) return;
  setLang(settings.language || 'he');
  const today = dayKey();
  const day = await getDay(today);
  if (!day) return;
  const set = await notifiedSet();

  let total = 0;
  for (const rec of Object.values(day.domains)) total += rec.t || 0;

  if (settings.dailyLimitMinutes > 0) {
    const limitSec = settings.dailyLimitMinutes * 60;
    const baseKey = `daily:${today}`;
    if (!(await isSnoozedKey(baseKey))) {
      const warnKey = `${baseKey}:80`;
      if (!set[warnKey] && total >= limitSec * 0.8 && total < limitSec) {
        notifyLimit(warnKey, t('notif.dailyLimitWarn.title'), t('notif.dailyLimitWarn.body', { n: settings.dailyLimitMinutes }));
        await markNotified(warnKey);
      }
      if (!set[baseKey] && total >= limitSec) {
        notifyLimit(baseKey, t('notif.dailyLimit.title'), t('notif.dailyLimit.body', { n: settings.dailyLimitMinutes }));
        await markNotified(baseKey);
      }
    }
  }
  if (domain && settings.siteLimits[domain] > 0) {
    const limitSec = settings.siteLimits[domain] * 60;
    const used = day.domains[domain]?.t || 0;
    const baseKey = `site:${today}:${domain}`;
    if (!(await isSnoozedKey(baseKey))) {
      const warnKey = `${baseKey}:80`;
      if (!set[warnKey] && used >= limitSec * 0.8 && used < limitSec) {
        notifyLimit(warnKey, t('notif.siteLimitWarn.title'), t('notif.siteLimitWarn.body', { d: domain, n: settings.siteLimits[domain] }));
        await markNotified(warnKey);
      }
      if (!set[baseKey] && used >= limitSec) {
        notifyLimit(baseKey, t('notif.siteLimit.title'), t('notif.siteLimit.body', { d: domain, n: settings.siteLimits[domain] }));
        await markNotified(baseKey);
      }
    }
  }
}

function notify(title, message, id) {
  try {
    chrome.notifications.create(id || '', {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icons/icon128.png'),
      title,
      message,
      priority: 1,
    });
  } catch { /* notifications permission may be revoked */ }
}

// Limit notifications use their dedup key as a stable notification id and add a
// snooze button, so `onButtonClicked` can map a click straight back to the key.
function notifyLimit(id, title, message) {
  try {
    chrome.notifications.create(id, {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icons/icon128.png'),
      title,
      message,
      priority: 1,
      buttons: [{ title: t('notif.snoozeBtn') }],
    });
  } catch { /* notifications permission may be revoked, or buttons unsupported */ }
}

// Snoozing either the 80%-warning or the 100%-reached notification for a limit
// suppresses both for the rest of the snooze window (strip a trailing ":80").
chrome.notifications.onButtonClicked.addListener(async (notificationId, buttonIndex) => {
  if (buttonIndex !== 0) return;
  const baseKey = notificationId.endsWith(':80') ? notificationId.slice(0, -3) : notificationId;
  if (baseKey.startsWith('daily:') || baseKey.startsWith('site:')) {
    await setSnoozeKey(baseKey);
    try { chrome.notifications.clear(notificationId); } catch { /* already gone */ }
  }
});

// One-time (per week) heads-up if local storage is getting large. unlimitedStorage
// removes Chrome's extension-storage cap, but disk space is still finite.
async function maybeStorageWarning(settings) {
  const meta = await getMeta();
  if (Date.now() - (meta.lastStorageWarning || 0) < 7 * 86400000) return;
  const bytes = await storageFootprint();
  if (bytes < STORAGE_WARN_BYTES) return;
  setLang(settings.language || 'he');
  notify(t('notif.storageWarn.title'), t('notif.storageWarn.body', { v: `${(bytes / (1024 * 1024)).toFixed(0)} MB` }));
  await saveMeta({ lastStorageWarning: Date.now() });
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
    await maybeStorageWarning(await getSettings());
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
  setLang(settings.language || 'he');

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
      // Read-only: report the current segment without committing. Time is
      // committed by browser events and the 1-minute tick, so periodic polling
      // from the popup/dashboard no longer amplifies storage writes. Live seconds
      // are bounded by the same cap we use for crediting, so a long dormancy
      // can't show an inflated counter.
      const st = await loadState();
      const settings = await getSettings();
      const today = await getDay(dayKey());
      let live = 0;
      if (st.counting && st.domain && st.since) {
        live = Math.min((Date.now() - st.since) / 1000, MAX_SEGMENT_SECONDS);
      }
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
    longBreakMs: Math.max(0, Math.min(120, f.longBreakMinutes || 0)) * 60000,
    longBreakEvery: Math.max(1, Math.min(12, f.longBreakEvery || 4)),
    endsAt: Date.now() + workMin * 60000,
    mode: f.mode === 'allow' ? 'allow' : 'block',
    blockCategories: f.blockCategories || [],
    blockDomains: f.blockDomains || [],
    allowCategories: f.allowCategories || [],
    allowDomains: f.allowDomains || [],
  };
  await saveFocus(focus);
  await enforceAllTabs(settings, focus);
  setLang(settings.language || 'he');
  const cyc = focus.totalCycles > 1 ? t('notif.focusStart.cycles', { n: focus.totalCycles }) : '';
  notify(t('notif.focusStart.title'), t('notif.focusStart.body', { m: workMin, cyc }));
  return focusView(focus);
}

// ---- keyboard shortcuts (chrome.commands) ----
chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'toggle-tracking') {
    const settings = await getSettings();
    const next = await saveSettings({ enabled: !settings.enabled });
    await refresh();
    updateBadge(next, false);
    setLang(next.language || 'he');
    notify('TimeTrack', next.enabled ? t('notif.trackOn') : t('notif.trackOff'));
  } else if (command === 'start-focus') {
    const focus = await loadFocus();
    if (sessionLive(focus)) {
      focus.active = false;
      await saveFocus(focus);
      setLang((await getSettings()).language || 'he');
      notify('TimeTrack', t('notif.focusEndedCmd'));
    } else await startFocusSession();
  } else if (command === 'open-dashboard') {
    chrome.runtime.openOptionsPage();
  }
});

// Kick things off when the worker first loads.
init();
