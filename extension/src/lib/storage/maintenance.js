// Retention, deleting data, renaming/merging a domain, storage size.
// Part of the persistence layer; import from ../storage.js (the facade).

import { DAY_PREFIX, K } from './keys.js';
import { getSettings, removeSettingsMapEntry, saveSettings, setSettingsMapEntry } from './settings.js';
import { getDays, getIndex, saveMeta } from './days.js';
import { clearFocusLog, clearSessions, getSessions } from './logs.js';
import { dayKey } from '../utils.js';

/** The days (from `index`) that a retention of `retentionDays` would delete. 0 or less keeps everything. */
export function prunableDays(index, retentionDays, now = Date.now()) {
  if (!retentionDays || retentionDays <= 0) return [];
  const cutoff = dayKey(new Date(now - retentionDays * 86400000));
  return index.filter((k) => k < cutoff);
}

/** How many days a retention of `retentionDays` would delete right now — for confirming before lowering it. */
export async function countPrunable(retentionDays) {
  return prunableDays(await getIndex(), retentionDays).length;
}

export async function pruneOld(retentionDays) {
  if (!retentionDays || retentionDays <= 0) return 0;
  const idx = await getIndex();
  const cutoff = dayKey(new Date(Date.now() - retentionDays * 86400000));
  const remove = prunableDays(idx, retentionDays);
  if (!remove.length) return 0;
  await chrome.storage.local.remove([...remove.map(K.day), ...remove.map(K.sess)]);
  const kept = idx.filter((k) => k >= cutoff);
  await chrome.storage.local.set({ [K.INDEX]: kept });
  return remove.length;
}

/** Delete specific days (and their session logs), keeping the index and firstDay consistent. */
export async function removeDays(keys) {
  const drop = new Set(keys);
  await chrome.storage.local.remove([...keys.map(K.day), ...keys.map(K.sess)]);
  const kept = (await getIndex()).filter((k) => !drop.has(k));
  await chrome.storage.local.set({ [K.INDEX]: kept });
  await saveMeta({ firstDay: kept[0] || null });
}

export async function clearAllData() {
  // Scan by prefix as well as by index: a day written without its index entry (an old crash) must not survive.
  const all = await chrome.storage.local.get(null);
  const dayKeys = Object.keys(all).filter((k) => k.startsWith(DAY_PREFIX));
  if (dayKeys.length) await chrome.storage.local.remove(dayKeys);
  await clearSessions();
  await clearFocusLog();
  await chrome.storage.local.remove(K.PREV);                    // the undo copy is old data too
  await chrome.storage.local.set({ [K.INDEX]: [] });
  await saveMeta({ firstDay: null, demoDays: [] });
}

export async function storageFootprint() {
  try {
    const bytes = await chrome.storage.local.getBytesInUse(null);
    return bytes;
  } catch {
    return 0;
  }
}

/**
 * Combine one domain's entire history into another (e.g. a site rebranded) and
 * remove the old domain. Sums t/v/dh per day (these are two distinct domains
 * being combined, not a duplicate re-import of the same data — max-merging like
 * importAll would silently drop whichever domain has less time). Also migrates
 * categoryMap/siteLimits/blacklist/focus per-domain lists that reference the old
 * domain. Returns the number of day records touched.
 */
export async function mergeDomainAlias(oldDomain, newDomain) {
  if (!oldDomain || !newDomain || oldDomain === newDomain) return 0;
  const idx = await getIndex();
  const days = await getDays(idx);
  const writes = {};
  let touched = 0;
  const touchedKeys = [];

  for (const key of idx) {
    const day = days[key];
    const oldRec = day && day.domains && day.domains[oldDomain];
    if (!oldRec) continue;
    const newRec = day.domains[newDomain] || { t: 0, v: 0 };
    const merged = { t: (newRec.t || 0) + (oldRec.t || 0), v: (newRec.v || 0) + (oldRec.v || 0) };
    const dh = sumDh(newRec.dh, oldRec.dh);
    if (dh) merged.dh = dh;
    const nextDomains = { ...day.domains, [newDomain]: merged };
    delete nextDomains[oldDomain];
    writes[K.day(key)] = { ...day, domains: nextDomains };
    touched++;
    touchedKeys.push(key);
  }
  if (touched) await chrome.storage.local.set(writes);

  // Session logs name domains too; only days where the old domain had time can mention it.
  if (touchedKeys.length) {
    const logs = await getSessions(touchedKeys);
    const sessionWrites = {};
    for (const [key, list] of Object.entries(logs)) {
      if (list.some((e) => e[0] === oldDomain)) {
        sessionWrites[K.sess(key)] = list.map((e) => (e[0] === oldDomain ? [newDomain, e[1], e[2]] : e));
      }
    }
    if (Object.keys(sessionWrites).length) await chrome.storage.local.set(sessionWrites);
  }

  // Re-point every per-domain setting. An existing entry for the new domain wins.
  const settings = await getSettings();
  for (const mapKey of ['categoryMap', 'siteLimits']) {      // the domain-keyed maps (budgets are keyed by category)
    if (settings[mapKey][oldDomain] == null) continue;
    if (settings[mapKey][newDomain] == null) await setSettingsMapEntry(mapKey, newDomain, settings[mapKey][oldDomain]);
    await removeSettingsMapEntry(mapKey, oldDomain);
  }
  const rename = (list) => [...new Set(list.map((d) => (d === oldDomain ? newDomain : d)))];
  const patch = {};
  if (settings.blacklist.includes(oldDomain)) patch.blacklist = rename(settings.blacklist);
  if ((settings.pinnedSites || []).includes(oldDomain)) patch.pinnedSites = rename(settings.pinnedSites);
  for (const listKey of ['blockDomains', 'allowDomains']) {
    if ((settings.focus[listKey] || []).includes(oldDomain)) (patch.focus ||= {})[listKey] = rename(settings.focus[listKey]);
  }
  if (Object.keys(patch).length) await saveSettings(patch);

  return touched;
}

/** Sum (not max) two per-domain hourly maps — used when combining distinct domains. */
function sumDh(a = {}, b = {}) {
  const out = { ...a };
  for (const [h, v] of Object.entries(b)) out[h] = (out[h] || 0) + (v || 0);
  return Object.keys(out).length ? out : undefined;
}
