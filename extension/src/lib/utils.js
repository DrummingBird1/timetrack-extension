// Shared helpers: dates, domains, formatting. No DOM, no chrome APIs here so it
// can be imported equally from the service worker, popup and dashboard.

import { PSL_RULES } from './psl.js';

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

// ---- public suffix handling (see psl.js — generated from the Public Suffix List) ----
// The rule index is built on first use, so code paths that never group a hostname
// (e.g. a service-worker cold start with nothing to track) don't pay for it.
let pslIndex = null;
function loadPsl() {
  if (pslIndex) return pslIndex;
  const rules = new Set();
  const wildcards = new Set();   // "*.ck"  -> "ck"
  const exceptions = new Set();  // "!www.ck" -> "www.ck"
  for (const rule of PSL_RULES.split('\n')) {
    if (!rule) continue;
    if (rule[0] === '!') exceptions.add(rule.slice(1));
    else if (rule[0] === '*') wildcards.add(rule.slice(2));
    else rules.add(rule);
  }
  pslIndex = { rules, wildcards, exceptions };
  return pslIndex;
}

/** How many trailing labels of `labels` are a public suffix (PSL algorithm; default rule "*" = 1). */
function publicSuffixLength(labels) {
  const { rules, wildcards, exceptions } = loadPsl();
  let best = 1;
  for (let i = 0; i < labels.length; i++) {
    const suffix = labels.slice(i).join('.');
    if (exceptions.has(suffix)) return labels.length - i - 1;     // an exception beats every other rule
    const n = labels.length - i;
    if (rules.has(suffix) || (i + 1 < labels.length && wildcards.has(labels.slice(i + 1).join('.')))) best = Math.max(best, n);
  }
  return best;
}

const isIpv4 = (host) => /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
const isIpv6 = (host) => host.includes(':');   // URL.hostname brackets these: "[::1]"

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

/**
 * Collapse a hostname to its registrable domain (example.com, bbc.co.uk,
 * alice.github.io). IP addresses, dev hosts like "localhost", and hosts that ARE a
 * public suffix are returned unchanged.
 */
export function registrableDomain(host) {
  if (!host) return host;
  if (isIpv4(host) || isIpv6(host)) return host;
  const labels = host.split('.');
  const suffixLen = publicSuffixLength(labels);
  if (labels.length <= suffixLen) return host;
  return labels.slice(labels.length - suffixLen - 1).join('.');
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
  ar: { h: 'س', m: 'د', s: 'ث' },
  ru: { h: 'ч', m: 'мин', s: 'с' },
  es: { h: 'h', m: 'min', s: 's' },
  fr: { h: 'h', m: 'min', s: 's' },
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
export const WEEKDAYS_AR = ['أحد', 'اثن', 'ثلا', 'أرب', 'خمي', 'جمع', 'سبت'];
export const WEEKDAYS_FULL_AR = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
export const WEEKDAYS_RU = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
export const WEEKDAYS_FULL_RU = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];
export const WEEKDAYS_ES = ['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá'];
export const WEEKDAYS_FULL_ES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
export const WEEKDAYS_FR = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
export const WEEKDAYS_FULL_FR = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

const WEEKDAYS_SHORT_BY_LANG = { he: WEEKDAYS_HE, en: WEEKDAYS_EN, ar: WEEKDAYS_AR, ru: WEEKDAYS_RU, es: WEEKDAYS_ES, fr: WEEKDAYS_FR };
const WEEKDAYS_FULL_BY_LANG = { he: WEEKDAYS_FULL_HE, en: WEEKDAYS_FULL_EN, ar: WEEKDAYS_FULL_AR, ru: WEEKDAYS_FULL_RU, es: WEEKDAYS_FULL_ES, fr: WEEKDAYS_FULL_FR };

export function weekdaysShort(l = 'he') {
  return WEEKDAYS_SHORT_BY_LANG[l] || WEEKDAYS_HE;
}

export function weekdaysFull(l = 'he') {
  return WEEKDAYS_FULL_BY_LANG[l] || WEEKDAYS_FULL_HE;
}

export function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}

/**
 * Hand-rolled passphrase strength heuristic (no dependency): counts character
 * classes present and combines with length. Returns null for an empty string
 * (caller should hide the meter), otherwise 'weak' | 'medium' | 'strong'.
 */
export function passphraseStrength(pw) {
  if (!pw) return null;
  let classes = 0;
  if (/[a-z]/.test(pw)) classes++;
  if (/[A-Z]/.test(pw)) classes++;
  if (/[0-9]/.test(pw)) classes++;
  if (/[^a-zA-Z0-9]/.test(pw)) classes++;
  if (pw.length < 8 || classes < 2) return 'weak';
  if (pw.length >= 12 && classes >= 3) return 'strong';
  return 'medium';
}

export function sum(arr) {
  return arr.reduce((a, b) => a + b, 0);
}
