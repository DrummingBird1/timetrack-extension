// Limit and budget notifications: the per-day dedupe, snoozing, the storage warning and notify helpers.
// Part of the service worker; background.js owns the event wiring.

import { getDay, getDays, getMeta, saveMeta, storageFootprint } from '../lib/storage.js';
import { dayKey, keysBetween, startOfWeek } from '../lib/utils.js';
import { categorize } from '../lib/categories.js';
import { categorySeconds, domainInTag, tagSeconds } from '../lib/stats.js';
import { setLang, t } from '../lib/i18n.js';

const NOTIFIED = 'ttt_notified';
const SNOOZED = 'ttt_snoozed';
const SNOOZE_MS = 60 * 60 * 1000;              // "+1h" snooze button on limit notifications
const STORAGE_WARN_BYTES = 250 * 1024 * 1024;  // soft heads-up threshold (unlimitedStorage has no hard extension cap, but disk is still finite)

// ---- limit notifications (deduped per day, snoozable) ----
// Kept in storage.local (not session) so a browser restart doesn't re-fire today's
// notifications. Values are the time each was sent; entries older than 14 days are dropped.
const NOTIFIED_TTL_MS = 14 * 24 * 3600 * 1000;
export async function notifiedSet() {
  const r = await chrome.storage.local.get(NOTIFIED);
  return r[NOTIFIED] || {};
}
export async function markNotified(key) {
  const set = await notifiedSet();
  const now = Date.now();
  set[key] = now;
  for (const [k, at] of Object.entries(set)) if (typeof at === 'number' && now - at > NOTIFIED_TTL_MS) delete set[k];
  await chrome.storage.local.set({ [NOTIFIED]: set });
}

async function snoozedSet() {
  const r = await chrome.storage.session.get(SNOOZED);
  return r[SNOOZED] || {};
}
async function isSnoozedKey(key) {
  const set = await snoozedSet();
  return !!(set[key] && Date.now() < set[key]);
}
export async function setSnoozeKey(key) {
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
export async function checkLimits(settings, domain) {
  if (!settings.notifyLimits) return;
  await setLang(settings.language || 'he');
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

  // Weekly category budget — only worth reading the week's days when the site being
  // visited belongs to a budgeted category.
  const category = domain ? categorize(domain, settings.categoryMap) : null;
  const budgetMinutes = category ? settings.categoryBudgets?.[category] : 0;
  if (budgetMinutes > 0) {
    const weekStart = startOfWeek(new Date(), settings.weekStart);
    const baseKey = `cat:${dayKey(weekStart)}:${category}`;
    if (!(await isSnoozedKey(baseKey))) {
      const limitSec = budgetMinutes * 60;
      const used = categorySeconds(await getDays(keysBetween(weekStart, new Date())), settings.categoryMap)[category] || 0;
      const vars = { c: t(`category.${category}`), n: budgetMinutes };
      const warnKey = `${baseKey}:80`;
      if (!set[warnKey] && used >= limitSec * 0.8 && used < limitSec) {
        notifyLimit(warnKey, t('notif.catBudgetWarn.title'), t('notif.catBudgetWarn.body', vars));
        await markNotified(warnKey);
      }
      if (!set[baseKey] && used >= limitSec) {
        notifyLimit(baseKey, t('notif.catBudget.title'), t('notif.catBudget.body', vars));
        await markNotified(baseKey);
      }
    }
  }

  // Weekly tag budgets: only for the tags the site being visited belongs to.
  if (domain) {
    const weekStart = startOfWeek(new Date(), settings.weekStart);
    let weekDays = null;
    for (const [tag, sites] of Object.entries(settings.tags || {})) {
      const minutes = settings.tagBudgets?.[tag];
      if (!(minutes > 0) || !sites.some((s) => domainInTag(domain, s))) continue;
      const baseKey = `tag:${dayKey(weekStart)}:${tag}`;
      if (await isSnoozedKey(baseKey)) continue;
      weekDays ||= await getDays(keysBetween(weekStart, new Date()));
      const used = tagSeconds(weekDays, { [tag]: sites })[0]?.seconds || 0;
      const limitSec = minutes * 60;
      const vars = { c: tag, n: minutes };
      const warnKey = `${baseKey}:80`;
      if (!set[warnKey] && used >= limitSec * 0.8 && used < limitSec) {
        notifyLimit(warnKey, t('notif.tagBudgetWarn.title'), t('notif.tagBudgetWarn.body', vars));
        await markNotified(warnKey);
      }
      if (!set[baseKey] && used >= limitSec) {
        notifyLimit(baseKey, t('notif.tagBudget.title'), t('notif.tagBudget.body', vars));
        await markNotified(baseKey);
      }
    }
  }
}

export function notify(title, message, id) {
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

// One-time (per week) heads-up if local storage is getting large. unlimitedStorage
// removes Chrome's extension-storage cap, but disk space is still finite.
export async function maybeStorageWarning(settings) {
  const meta = await getMeta();
  if (Date.now() - (meta.lastStorageWarning || 0) < 7 * 86400000) return;
  const bytes = await storageFootprint();
  if (bytes < STORAGE_WARN_BYTES) return;
  await setLang(settings.language || 'he');
  notify(t('notif.storageWarn.title'), t('notif.storageWarn.body', { v: `${(bytes / (1024 * 1024)).toFixed(0)} MB` }));
  await saveMeta({ lastStorageWarning: Date.now() });
}
