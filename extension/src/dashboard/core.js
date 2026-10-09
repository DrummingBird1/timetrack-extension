// Shared dashboard state, DOM helpers and small UI primitives used by every tab.
import { getIndex, getDays } from '../lib/storage.js';
import { aggregateDomains } from '../lib/stats.js';
import { dayKey, rangeKeys, keysBetween, favicon } from '../lib/utils.js';
import { CATEGORY_DEFS } from '../lib/categories.js';
import { t, locale } from '../lib/i18n.js';

export const $ = (s) => document.querySelector(s);
export const $$ = (s) => document.querySelectorAll(s);

// ---- shared state (live bindings: importers see updates; only this module assigns) ----
export let settings = null;
export let currentRange = 7;             // number | 'all' | { from: Date, to: Date }
export let currentTab = 'overview';
export let cache = { keys: [], days: {}, agg: {} };
export let siteAllHistory = false;       // Sites tab: aggregate the whole index, not just the range
export let allCache = null;              // lazily-built full-history cache; invalidated on data changes
export const setSettings = (v) => { settings = v; };
export const setCurrentRange = (v) => { currentRange = v; };
export const setCurrentTab = (v) => { currentTab = v; };
export const setSiteAllHistory = (v) => { siteAllHistory = v; };
export const setAllCache = (v) => { allCache = v; };

// Entry-point functions (refresh, applyLanguage, ...) registered by dashboard.js so
// feature modules can call them without importing it back (which would be circular).
export const actions = {};

export function send(type, extra = {}) {
  return chrome.runtime.sendMessage({ type, ...extra }).catch(() => ({}));
}

export function toast(message, kind = '') {
  const el = $('#toast');
  el.textContent = message;
  el.className = `toast show ${kind}`;
  setTimeout(() => { el.className = 'toast'; }, 2600);
}

// Site icon: Chrome's local favicon cache when the user opted in (permission
// granted), otherwise the privacy-safe generated letter avatar.
export function iconFor(domain) {
  if (settings.realFavicons) {
    return `${chrome.runtime.getURL('_favicon/')}?pageUrl=${encodeURIComponent('https://' + domain)}&size=32`;
  }
  return favicon(domain);
}

// Normalize free-typed input to a bare registrable-ish domain, or '' if unusable.
export function cleanDomain(raw) {
  const d = (raw || '').trim().toLowerCase()
    .replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '');
  return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(d) ? d : '';
}

// Sites tab reads either the selected range (default) or the full history.
export async function sitesSource() {
  if (!siteAllHistory) return cache;
  if (!allCache) {
    const keys = await getIndex();
    const days = await getDays(keys);
    allCache = { keys, days, agg: aggregateDomains(days) };
  }
  return allCache;
}

export function productiveTime(cats) {
  return cats.filter((c) => CATEGORY_DEFS[c.key]?.score > 0).reduce((a, c) => a + c.t, 0);
}
export function distractingTime(cats) {
  return cats.filter((c) => CATEGORY_DEFS[c.key]?.score < 0).reduce((a, c) => a + c.t, 0);
}

// ---------------- data loading ----------------
export function rangeKeyList() {
  if (currentRange === 'all') return null; // resolved against the index
  if (typeof currentRange === 'object') return keysBetween(currentRange.from, currentRange.to);
  return rangeKeys(currentRange);
}

export async function loadRange() {
  let keys = rangeKeyList();
  if (keys === null) {
    keys = await getIndex();
    if (!keys.length) keys = [dayKey()];
  }
  const days = await getDays(keys);
  cache = { keys, days, agg: aggregateDomains(days) };
  return cache;
}

export function rangeLabel() {
  if (currentRange === 'all') return t('range.all');
  if (typeof currentRange === 'object') {
    const o = { day: 'numeric', month: 'short' };
    return `${currentRange.from.toLocaleDateString(locale(), o)} – ${currentRange.to.toLocaleDateString(locale(), o)}`;
  }
  if (currentRange === 1) return t('range.today');
  return t(`range.${currentRange}`);
}

export function statCard({ icon, val, lbl, delta }) {
  const deltaHtml = delta == null ? '' :
    `<div class="delta ${delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat'}">
       ${delta > 0 ? '▲' : delta < 0 ? '▼' : '•'} ${Math.abs(delta)}% ${t('delta.prev')}
     </div>`;
  return `<div class="stat-card">
    <div class="ic">${icon}</div>
    <div class="val">${val}</div>
    <div class="lbl">${lbl}</div>
    ${deltaHtml}
  </div>`;
}

export const ICONS = {
  clock: '<svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 100 20 10 10 0 000-20zm1 11h-2V6h2v5l4 2-1 1.7L13 13z"/></svg>',
  cal: '<svg viewBox="0 0 24 24"><path d="M19 4h-1V2h-2v2H8V2H6v2H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V6a2 2 0 00-2-2zm0 16H5V10h14v10z"/></svg>',
  avg: '<svg viewBox="0 0 24 24"><path d="M3 17l6-6 4 4 8-8-1.4-1.4L13 12l-4-4-7.6 7.6z"/></svg>',
  focus: '<svg viewBox="0 0 24 24"><path d="M12 8a4 4 0 100 8 4 4 0 000-8zm0-6v3m0 14v3M2 12h3m14 0h3"/></svg>',
  fire: '<svg viewBox="0 0 24 24"><path d="M13 2s4 4 4 9a5 5 0 01-10 0c0-2 1-3 1-3s0 2 2 2c1 0 1-2 0-4-1-2 3-4 3-6zM9 16a3 3 0 006 0c0-1-1-2-1-2s0 1-1 1-1-1-1-2c-2 1-2 2-2 3z"/></svg>',
  globe: '<svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 100 20 10 10 0 000-20zm0 2c1.5 1.8 2.4 4.6 2.5 8H9.5c.1-3.4 1-6.2 2.5-8zM4 12a8 8 0 015-7.4A18 18 0 007.5 12 18 18 0 009 19.4 8 8 0 014 12zm11 7.4A18 18 0 0016.5 12 18 18 0 0015 4.6 8 8 0 0115 19.4z"/></svg>',
};

export function closeModal() {
  $('#siteModal').classList.add('hidden');
  $('#welcomeModal').classList.add('hidden');
  $('#restoreModal').classList.add('hidden');
}

export function debounce(fn, ms) {
  let timer;
  return (...a) => { clearTimeout(timer); timer = setTimeout(() => fn(...a), ms); };
}
