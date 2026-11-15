// TimeTrack service worker — the time-tracking engine.
//
// It keeps a single "current segment" (which domain is being watched and since
// when). On any relevant browser event it commits the elapsed time of the
// previous segment, then re-evaluates what should be tracked now. Counting only
// happens while the window is focused, the user is not idle, and the domain is
// trackable. State survives SW restarts via chrome.storage.session.

import { getSettings, saveSettings, addTime, addVisit, recordSession, addFocusLog, getDay, pruneOld, saveMeta, getMeta, migrate, K } from './src/lib/storage.js';
import { domainFromUrl, dayKey } from './src/lib/utils.js';
import { runAutoBackup } from './src/lib/backup.js';
import { setLang, t, pickLanguage } from './src/lib/i18n.js';
import { parseMessage } from './src/lib/messages.js';
import { checkLimits, notify, setSnoozeKey } from './src/worker/notifications.js';
import { runHourlyJobs } from './src/worker/jobs.js';
import { blockingLive, focusView, isBlocked, loadFocus, saveFocus, sessionLive } from './src/worker/focusState.js';

const SESSION_STATE = 'ttt_state';
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
let statePromise = null;
// Single-flight: two events arriving together on a cold start (an unlock fires idle and window
// focus at once) must share ONE state object, or the second load replaces the first one's edits.
function loadState() {
  if (state) return Promise.resolve(state);
  statePromise ||= chrome.storage.session.get(SESSION_STATE).then((r) => {
    state ||= r[SESSION_STATE] || {
      domain: null, since: 0, counting: false, lastDomain: null,
      focused: true, idle: false, audible: false,
    };
    return state;
  }).catch((e) => { statePromise = null; throw e; });
  return statePromise;
}
async function saveState() {
  await chrome.storage.session.set({ [SESSION_STATE]: state });
}

const BLOCK_PAGE = chrome.runtime.getURL('src/blocked/blocked.html');
const SELF_PREFIX = chrome.runtime.getURL('');

async function enforceFocusOnTab(tabId, url, settings, focus) {
  if (!blockingLive(focus) || !url || url.startsWith(SELF_PREFIX)) return;
  const domain = domainFromUrl(url, settings.groupSubdomains);
  if (isBlocked(domain, settings, focus)) {
    try {
      // Where the block page sends the tab when the block ends. It travels in storage.session, not in the
      // page's address: a web-accessible page that navigates to a URL taken from its own query string is an
      // open redirect for any site that links to it.
      await chrome.storage.session.set({ [K.blocked(tabId)]: { d: domain, u: url } });
      await chrome.tabs.update(tabId, { url: BLOCK_PAGE });
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

/** Append a finished / early-ended session to the history (sessions under 30 s of work are noise). */
async function logFocusSession(focus, endedEarly) {
  const total = focus.totalCycles || 1;
  const inWork = focus.phase === 'work';
  const completedCycles = endedEarly ? (inWork ? focus.cycle || 0 : (focus.cycle || 0) + 1) : total;
  const partialMs = endedEarly && inWork ? Math.max(0, focus.workMs - Math.max(0, focus.endsAt - Date.now())) : 0;
  const workedMs = Math.round(completedCycles * focus.workMs + partialMs);
  if (workedMs < 30000) return;
  await addFocusLog({ start: focus.startedAt || Date.now(), end: Date.now(), cycles: total, completedCycles, workedMs, endedEarly });
}

/** Advance the Pomodoro state machine when a phase ends. Returns current focus. */
async function checkFocusExpiry() {
  const focus = await loadFocus();
  if (focus.active && focus.pausedUntil && Date.now() >= focus.pausedUntil) {
    focus.pausedUntil = 0;                                   // the snooze is over: block again, including tabs opened meanwhile
    await saveFocus(focus);
    await enforceAllTabs(await getSettings(), focus);
  }
  if (!focus.active || Date.now() < focus.endsAt) return focus;
  const settings = await getSettings();
  await setLang(settings.language || 'he');

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
    await logFocusSession(focus, false);
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
    if (tab.incognito) return { domain: null, audible: false };   // never record private browsing, even if the user allowed the extension there
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
        if (settings.sessionLog) {
          const startSec = when.getHours() * 3600 + when.getMinutes() * 60 + when.getSeconds();
          await recordSession({ dateKey: dayKey(when), domain: st.domain, startSec, seconds: elapsed });
        }
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
    await checkFocusSchedule(settings);
    updateBadge(settings, counting);
  });
}

function updateBadge(settings, counting) {
  try {
    chrome.action.setBadgeBackgroundColor({ color: counting ? '#22c55e' : '#64748b' });
    chrome.action.setBadgeText({ text: settings.enabled ? '' : '⏸' });
  } catch { /* action may be unavailable */ }
}

// Snoozing either the 80%-warning or the 100%-reached notification for a limit
// suppresses both for the rest of the snooze window (strip a trailing ":80").
chrome.notifications.onButtonClicked.addListener(async (notificationId, buttonIndex) => {
  if (buttonIndex !== 0) return;
  const baseKey = notificationId.endsWith(':80') ? notificationId.slice(0, -3) : notificationId;
  if (baseKey.startsWith('daily:') || baseKey.startsWith('site:') || baseKey.startsWith('cat:')) {
    await setSnoozeKey(baseKey);
    try { chrome.notifications.clear(notificationId); } catch { /* already gone */ }
  }
});

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

chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.session.remove(K.blocked(tabId)).catch(() => {});
  refresh();
});

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
    await runHourlyJobs();   // the worker cold-starts on most ticks, so the 60-minute alarm alone can't be relied on
  } else if (alarm.name === BACKUP_ALARM) {
    await runHourlyJobs({ force: true });
  }
});

// An alarm that already exists is left alone: chrome.alarms.create() with the same name restarts
// its countdown, and init() runs on every worker start (most ticks).
async function ensureAlarm(name, periodInMinutes) {
  try {
    if (await chrome.alarms.get(name)) return;
  } catch { /* fall through and create it */ }
  chrome.alarms.create(name, { periodInMinutes });
}

// init() is shared by the top-level call, onStartup and onInstalled, which can all fire in the
// same worker start: run it once per worker so migrate() and the first refresh never overlap.
let initPromise = null;
function init() {
  initPromise ||= runInit().catch((e) => { initPromise = null; throw e; });
  return initPromise;
}

async function runInit() {
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

  await ensureAlarm(TICK_ALARM, 1);
  await ensureAlarm(BACKUP_ALARM, 60);

  const settings = await getSettings();
  await pruneOld(settings.retentionDays);
  refresh();
}

chrome.runtime.onStartup.addListener(init);
chrome.runtime.onInstalled.addListener(async (details) => {
  const meta = await getMeta();
  if (!meta.installedAt) await saveMeta({ installedAt: Date.now() });
  if (details.reason === 'install') {
    // Start in the browser's language when we have it (otherwise English), not always in Hebrew.
    try { await saveSettings({ language: pickLanguage(chrome.i18n.getUILanguage()) }); } catch { /* keep the default */ }
    chrome.tabs.create({ url: chrome.runtime.getURL('src/dashboard/dashboard.html#welcome') });
  }
  await init();
});

// ---- messaging (popup + dashboard) ----
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (sender && sender.id !== chrome.runtime.id) return false;   // only this extension's own pages
  handleMessage(msg).then(sendResponse).catch((e) => sendResponse({ error: e.message }));
  return true; // async
});

async function handleMessage(raw) {
  const msg = parseMessage(raw);
  if (!msg) return { ok: false, unknown: true };
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
      const r = await runAutoBackup({ force: true });          // the user pressed "Back up now"
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
      if (sessionLive(focus) && focus.strict && focus.phase === 'work') return { active: true, refused: true };
      if (sessionLive(focus)) await logFocusSession(focus, true);
      focus.active = false;
      await saveFocus(focus);
      return { active: false };
    }
    case 'snoozeFocus': {
      const focus = await loadFocus();
      if (!sessionLive(focus) || focus.phase !== 'work' || focus.strict) return { ...focusView(focus), refused: true };
      const minutes = Math.max(1, Math.min(30, msg.minutes || 10));
      focus.pausedUntil = Date.now() + minutes * 60000;
      await saveFocus(focus);
      return focusView(focus);
    }
    default:
      return { ok: false, unknown: true };
  }
}

// Auto-start sessions at their scheduled weekday + time. A slot fires if its time passed
// within the last 10 minutes (the worker may sleep between ticks) and has not fired today.
const SCHEDULE_FIRED = 'ttt_sched_fired';
const SCHEDULE_GRACE_MS = 10 * 60 * 1000;
async function checkFocusSchedule(settings) {
  const schedule = settings.focus.schedule || [];
  if (!schedule.length) return;
  if (sessionLive(await loadFocus())) return;
  const now = new Date();
  const today = dayKey(now);
  const stored = (await chrome.storage.session.get(SCHEDULE_FIRED))[SCHEDULE_FIRED] || {};
  const fired = stored.day === today ? stored : { day: today, slots: {} };
  for (let i = 0; i < schedule.length; i++) {
    const slot = schedule[i];
    if (!slot || !Array.isArray(slot.days) || !slot.days.includes(now.getDay())) continue;
    const [h, m] = String(slot.time).split(':').map(Number);
    if (!Number.isFinite(h) || !Number.isFinite(m)) continue;
    const late = now.getTime() - new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m).getTime();
    const id = i + '@' + slot.time;
    if (late < 0 || late > SCHEDULE_GRACE_MS || fired.slots[id]) continue;
    fired.slots[id] = true;
    await chrome.storage.session.set({ [SCHEDULE_FIRED]: fired });
    await startFocusSession(slot.minutes);
    return;
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
    strict: !!f.strict,
    pausedUntil: 0,
    startedAt: Date.now(),
  };
  await saveFocus(focus);
  await enforceAllTabs(settings, focus);
  await setLang(settings.language || 'he');
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
    await setLang(next.language || 'he');
    notify('TimeTrack', next.enabled ? t('notif.trackOn') : t('notif.trackOff'));
  } else if (command === 'start-focus') {
    const focus = await loadFocus();
    if (sessionLive(focus)) {
      await setLang((await getSettings()).language || 'he');
      if (focus.strict && focus.phase === 'work') {
        notify('TimeTrack', t('blocked.strict'));
        return;
      }
      await logFocusSession(focus, true);
      focus.active = false;
      await saveFocus(focus);
      notify('TimeTrack', t('notif.focusEndedCmd'));
    } else await startFocusSession();
  } else if (command === 'open-dashboard') {
    chrome.runtime.openOptionsPage();
  }
});

// Kick things off when the worker first loads.
init();
