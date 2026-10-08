// Deterministic synthetic browsing history in the exact shape exportAll() produces,
// so it can be fed straight to importAll(). Used by the E2E suite and for
// measuring how the dashboard/storage scale with years of data.
//
//   node tools/fixture.mjs --days 1095 --seed 7 --out fixtures/big.json
//
// The same seed always yields byte-identical output (no Math.random / Date.now()
// except for the default end date, which callers can pin via `endDate`).

import fs from 'node:fs';
import path from 'node:path';
import { dayKey, addDays } from '../../extension/src/lib/utils.js';

// [domain, weight (popularity), peak-hour start, peak-hour end]
const SITE_POOL = [
  ['github.com', 9, 9, 18], ['stackoverflow.com', 6, 9, 18], ['developer.mozilla.org', 4, 9, 17],
  ['docs.google.com', 6, 9, 17], ['notion.so', 4, 9, 17], ['figma.com', 3, 10, 17], ['linear.app', 3, 9, 16],
  ['gmail.com', 8, 8, 20], ['slack.com', 6, 9, 17], ['zoom.us', 3, 10, 16], ['outlook.com', 3, 8, 17],
  ['youtube.com', 9, 18, 24], ['netflix.com', 4, 20, 24], ['twitch.tv', 3, 19, 24], ['spotify.com', 4, 8, 22],
  ['reddit.com', 7, 12, 23], ['twitter.com', 5, 8, 23], ['facebook.com', 5, 12, 23], ['instagram.com', 4, 18, 24],
  ['linkedin.com', 3, 9, 18], ['whatsapp.com', 5, 8, 23], ['telegram.org', 2, 8, 23],
  ['wikipedia.org', 5, 9, 22], ['medium.com', 3, 8, 22], ['news.ycombinator.com', 3, 8, 18], ['coursera.org', 2, 18, 23],
  ['ynet.co.il', 4, 7, 22], ['walla.co.il', 3, 7, 22], ['haaretz.co.il', 2, 7, 22], ['bbc.co.uk', 2, 7, 22],
  ['cnn.com', 2, 7, 22], ['nytimes.com', 2, 7, 22], ['amazon.com', 4, 12, 23], ['ebay.com', 2, 12, 23],
  ['aliexpress.com', 2, 19, 24], ['booking.com', 1, 19, 24], ['paypal.com', 1, 10, 20], ['bankhapoalim.co.il', 1, 9, 17],
  ['chat.openai.com', 5, 9, 22], ['claude.ai', 5, 9, 22], ['google.com', 9, 8, 23], ['maps.google.com', 2, 8, 20],
  ['aws.amazon.com', 2, 9, 17], ['vercel.com', 2, 9, 17], ['npmjs.com', 2, 9, 17], ['codepen.io', 1, 10, 22],
  ['dribbble.com', 1, 10, 22], ['behance.net', 1, 10, 22], ['soundcloud.com', 1, 12, 23], ['imdb.com', 1, 19, 24],
  ['trello.com', 2, 9, 17], ['asana.com', 1, 9, 17], ['dropbox.com', 1, 9, 17], ['drive.google.com', 3, 9, 17],
  ['weather.com', 1, 6, 9], ['stackexchange.com', 1, 9, 18], ['gitlab.com', 1, 9, 18], ['bitbucket.org', 1, 9, 18],
  ['duolingo.com', 1, 20, 24], ['kahoot.it', 1, 10, 14], ['mail.yahoo.com', 1, 8, 20],
];

// mulberry32 — tiny, fast, well-distributed seeded PRNG.
function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickWeighted(rand, pool, taken) {
  let total = 0;
  for (const s of pool) if (!taken.has(s[0])) total += s[1];
  let r = rand() * total;
  for (const s of pool) {
    if (taken.has(s[0])) continue;
    r -= s[1];
    if (r <= 0) return s;
  }
  return pool[0];
}

/**
 * @param {{days?: number, endDate?: Date, seed?: number, domainsPerDay?: [number, number]}} opts
 * @returns an exportAll()-shaped snapshot (no `settings` key, so importing it
 *   leaves the user's settings alone).
 */
export function buildSnapshot({ days = 365, endDate = new Date(), seed = 1, domainsPerDay = [6, 24] } = {}) {
  endDate = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate()); // local midnight → stable output within a day
  const rand = prng(seed);
  const out = {};
  for (let i = days - 1; i >= 0; i--) {
    const date = addDays(endDate, -i);
    const weekend = date.getDay() === 5 || date.getDay() === 6;     // Fri/Sat, as in the home market
    // ~6% of days are completely empty (travel, sick days), to avoid a perfectly even series.
    if (rand() < 0.06) continue;
    const n = Math.round(domainsPerDay[0] + rand() * (domainsPerDay[1] - domainsPerDay[0]) * (weekend ? 0.7 : 1));
    const taken = new Set();
    const domains = {};
    const hours = new Array(24).fill(0);
    for (let k = 0; k < n; k++) {
      const [domain, , from, to] = pickWeighted(rand, SITE_POOL, taken);
      taken.add(domain);
      const dh = {};
      let t = 0;
      const span = Math.max(1, to - from);
      const sessions = 1 + Math.floor(rand() * 4);
      for (let s = 0; s < sessions; s++) {
        const hour = Math.min(23, from + Math.floor(rand() * span));
        // log-normal-ish: many short stays, a few long ones (up to ~50 min per hour bucket)
        const secs = Math.round(Math.min(3000, 20 + Math.exp(rand() * 6.2)));
        dh[hour] = Math.min(3600, (dh[hour] || 0) + secs);
        hours[hour] += secs;
        t += secs;
      }
      domains[domain] = { t, v: 1 + Math.floor(rand() * 8), dh };
    }
    out[dayKey(date)] = { domains, hours };
  }
  const keys = Object.keys(out).sort();
  return {
    app: 'TimeTrack',
    version: 2,
    exportedAt: endDate.getTime(),
    meta: { version: 2, firstDay: keys[0] || null, installedAt: endDate.getTime() - days * 86400000 },
    days: out,
  };
}

/** Number of stored values — a rough proxy for how big the snapshot is. */
export function describe(snapshot) {
  let domainDays = 0;
  for (const d of Object.values(snapshot.days)) domainDays += Object.keys(d.domains).length;
  return { days: Object.keys(snapshot.days).length, domainDays, bytes: JSON.stringify(snapshot).length };
}

// ---- CLI ----
if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}` || process.argv[1]?.endsWith('fixture.mjs')) {
  const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, arr) => {
    if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1]]);
    return acc;
  }, []));
  if (args.out || args.days) {
    const snap = buildSnapshot({ days: Number(args.days || 365), seed: Number(args.seed || 1) });
    const info = describe(snap);
    if (args.out) {
      fs.mkdirSync(path.dirname(args.out), { recursive: true });
      fs.writeFileSync(args.out, JSON.stringify(snap));
      console.log(`wrote ${args.out}`);
    }
    console.log(info);
  }
}
