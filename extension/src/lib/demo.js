// Demo data for first-run exploration. 28 previous days of plausible browsing, generated
// deterministically (no Math.random), loaded only into an empty period and tagged in
// meta.demoDays so it can be removed later without touching anything the user tracked.

import { dayKey, addDays } from './utils.js';
import { importAll, getIndex, getMeta, saveMeta, removeDays } from './storage.js';

export const DEMO_DAYS = 28;

/** @type {Array<[string, number, number, number]>}  [domain, popularity, first hour, last hour] */
const SITES = [
  ['github.com', 8, 9, 18], ['stackoverflow.com', 5, 9, 17], ['docs.google.com', 5, 9, 17], ['notion.so', 4, 9, 17],
  ['gmail.com', 6, 8, 19], ['slack.com', 5, 9, 17], ['youtube.com', 7, 18, 23], ['netflix.com', 3, 20, 23],
  ['reddit.com', 5, 12, 22], ['twitter.com', 4, 8, 22], ['wikipedia.org', 3, 10, 21], ['bbc.co.uk', 2, 7, 21],
  ['amazon.com', 3, 12, 22], ['spotify.com', 3, 8, 21],
];

function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The demo day records, keyed by day, for the DEMO_DAYS days before `today`. */
export function buildDemoDays(today = new Date()) {
  const rand = seededRandom(20260101);
  const days = {};
  for (let i = DEMO_DAYS; i >= 1; i--) {
    const date = addDays(today, -i);
    const weekend = date.getDay() === 5 || date.getDay() === 6;
    const domains = {};
    const hours = new Array(24).fill(0);
    for (const [domain, popularity, from, to] of SITES) {
      if (rand() * 10 > popularity + (weekend ? 0 : 1)) continue;          // popular sites appear on most days
      const dh = {};
      let t = 0;
      for (let s = 0, n = 1 + Math.floor(rand() * 3); s < n; s++) {
        const hour = Math.min(23, from + Math.floor(rand() * Math.max(1, to - from)));
        const secs = Math.round(300 + rand() * (weekend ? 1500 : 2400));
        dh[hour] = Math.min(3600, (dh[hour] || 0) + secs);
        hours[hour] += secs;
        t += secs;
      }
      domains[domain] = { t, v: 1 + Math.floor(rand() * 6), dh };
    }
    days[dayKey(date)] = { domains, hours };
  }
  return days;
}

/** Load the demo into an empty period. Throws { code: 'HAS_DATA' } if any of those days already has data. */
export async function loadDemo(today = new Date()) {
  const days = buildDemoDays(today);
  const existing = new Set(await getIndex());
  if (Object.keys(days).some((key) => existing.has(key))) {
    throw Object.assign(new Error('there is already data in the demo period'), { code: 'HAS_DATA' });
  }
  await importAll({ app: 'TimeTrack', version: 3, days }, { mode: 'merge', includeSettings: false });
  await saveMeta({ demoDays: Object.keys(days) });
  return { days: Object.keys(days).length };
}

export async function isDemoActive() {
  return ((await getMeta()).demoDays || []).length > 0;
}

/** Remove the demo days (only those). Returns how many were removed. */
export async function removeDemo() {
  const keys = (await getMeta()).demoDays || [];
  if (!keys.length) return 0;
  await removeDays(keys);
  await saveMeta({ demoDays: [] });
  return keys.length;
}
