// Shared helpers: dates, domains, formatting. No DOM, no chrome APIs here so it
// can be imported equally from the service worker, popup and dashboard.

export function pad2(n) {
  return n < 10 ? '0' + n : '' + n;
}

/** Local-date key in YYYY-MM-DD (no UTC drift). */
export function dayKey(date = new Date()) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function parseDayKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

export function startOfWeek(date, weekStart = 0) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diff = (d.getDay() - weekStart + 7) % 7;
  return addDays(d, -diff);
}

/** Last `days` day-keys ending at (and including) `end`, oldest first. */
export function rangeKeys(days, end = new Date()) {
  const keys = [];
  for (let i = days - 1; i >= 0; i--) keys.push(dayKey(addDays(end, -i)));
  return keys;
}

/** Inclusive day-keys between two dates, oldest first. */
export function keysBetween(start, end) {
  const keys = [];
  let cur = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const last = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  while (cur <= last) {
    keys.push(dayKey(cur));
    cur = addDays(cur, 1);
  }
  return keys;
}

// Common multi-part public suffixes so "bbc.co.uk" groups correctly.
const MULTI_TLDS = new Set([
  'co.uk', 'org.uk', 'gov.uk', 'ac.uk', 'me.uk', 'net.uk',
  'co.il', 'org.il', 'ac.il', 'gov.il', 'net.il', 'muni.il',
  'co.jp', 'or.jp', 'ne.jp', 'go.jp',
  'com.au', 'net.au', 'org.au', 'gov.au', 'edu.au',
  'co.nz', 'org.nz', 'govt.nz',
  'com.br', 'com.cn', 'com.mx', 'com.tr', 'com.sg', 'com.hk', 'com.tw',
  'co.in', 'co.za', 'co.kr', 'co.id', 'co.th',
  // wider coverage
  'com.ar', 'com.co', 'com.pe', 'com.ve', 'com.uy', 'com.ec', 'com.py', 'com.bo',
  'com.ua', 'com.pl', 'com.ph', 'com.my', 'com.pk', 'com.bd', 'com.np', 'com.lk',
  'com.eg', 'com.sa', 'com.ng', 'com.gh', 'com.kw', 'com.qa', 'com.bh', 'com.lb',
  'com.ru', 'net.ru', 'org.ru', 'gov.ru',
  'co.ke', 'co.tz', 'co.ug', 'co.ma', 'co.zw', 'co.ao',
  'or.id', 'web.id', 'sch.id', 'ac.id', 'go.id',
  'gob.mx', 'edu.mx', 'org.mx', 'net.mx',
  'org.br', 'net.br', 'gov.br', 'edu.br',
  'co.jp', 'ac.jp', 'ne.jp',
  'org.au', 'edu.au', 'asn.au', 'id.au',
]);

/** Extract a lowercase hostname from a URL, or null for non-web pages. */
export function hostnameFromUrl(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    let host = u.hostname.toLowerCase();
    if (host.startsWith('www.')) host = host.slice(4);
    return host || null;
  } catch {
    return null;
  }
}

/** Collapse a hostname to its registrable domain (example.com, bbc.co.uk). */
export function registrableDomain(host) {
  if (!host) return host;
  const parts = host.split('.');
  if (parts.length <= 2) return host;
  const lastTwo = parts.slice(-2).join('.');
  if (MULTI_TLDS.has(lastTwo)) return parts.slice(-3).join('.');
  return lastTwo;
}

/** Resolve a tab URL to the bucket we store time under. */
export function domainFromUrl(url, groupSubdomains = true) {
  const host = hostnameFromUrl(url);
  if (!host) return null;
  return groupSubdomains ? registrableDomain(host) : host;
}

// Duration unit strings, switchable for the active UI language (set via i18n).
const DURATION_UNITS = {
  he: { h: 'שע׳', m: 'דק׳', s: 'שנ׳' },
  en: { h: 'h', m: 'm', s: 's' },
};
let durLang = 'he';
export function setDurationLocale(l) {
  durLang = DURATION_UNITS[l] ? l : 'he';
}

/** "2 שע׳ 14 דק׳" / "2h 14m" style human duration. */
export function formatDuration(totalSeconds, { compact = false } = {}) {
  totalSeconds = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (compact) {
    if (h) return `${h}:${pad2(m)}:${pad2(s)}`;
    return `${m}:${pad2(s)}`;
  }
  const u = DURATION_UNITS[durLang];
  if (h) return m ? `${h} ${u.h} ${m} ${u.m}` : `${h} ${u.h}`;
  if (m) return s ? `${m} ${u.m} ${s} ${u.s}` : `${m} ${u.m}`;
  return `${s} ${u.s}`;
}

/** Clock format HH:MM:SS / MM:SS for live counters. */
export function formatClock(totalSeconds) {
  totalSeconds = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return h ? `${h}:${pad2(m)}:${pad2(s)}` : `${pad2(m)}:${pad2(s)}`;
}

const AVATAR_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981',
  '#06b6d4', '#ef4444', '#84cc16', '#a855f7', '#14b8a6',
];

/**
 * A locally-generated letter avatar as a data: URI — deliberately NOT a remote
 * favicon service, so no domain the user visits is ever sent off-device.
 * Color is derived deterministically from the domain.
 */
export function favicon(domain) {
  const d = (domain || '?').replace(/^www\./, '');
  const first = d.charAt(0);
  const letter = /[a-z0-9]/i.test(first) ? first.toUpperCase() : '#';
  let hash = 0;
  for (let i = 0; i < d.length; i++) hash = (hash * 31 + d.charCodeAt(i)) >>> 0;
  const color = AVATAR_COLORS[hash % AVATAR_COLORS.length];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32">` +
    `<rect width="32" height="32" rx="8" fill="${color}"/>` +
    `<text x="16" y="22" font-family="Arial,sans-serif" font-size="17" font-weight="700" ` +
    `fill="#ffffff" text-anchor="middle">${letter}</text></svg>`;
  return 'data:image/svg+xml,' + encodeURIComponent(svg);
}

export const WEEKDAYS_HE = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];
export const WEEKDAYS_FULL_HE = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
export const WEEKDAYS_EN = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
export const WEEKDAYS_FULL_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function weekdaysShort(l = 'he') {
  return l === 'en' ? WEEKDAYS_EN : WEEKDAYS_HE;
}

export function weekdaysFull(l = 'he') {
  return l === 'en' ? WEEKDAYS_FULL_EN : WEEKDAYS_FULL_HE;
}

export function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}

export function sum(arr) {
  return arr.reduce((a, b) => a + b, 0);
}
