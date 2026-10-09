// Sites tab: searchable / sortable table, pinning, per-site daily limits, bulk actions.
//
// Scale: rows are appended in chunks (CHUNK at a time, the next chunk loads when the
// sentinel under the table scrolls into view), so a history with thousands of
// domains renders instantly and re-renders cheaply on every keystroke. Selection is
// kept as a set of domains, so "select all" covers the whole filtered list — not only
// the rows that happen to be in the DOM.
import {
  saveSettings, setSettingsMapEntries, removeSettingsMapEntries,
  setSettingsMapEntry, removeSettingsMapEntry,
} from '../lib/storage.js';
import { formatDuration } from '../lib/utils.js';
import { categorize, categoryDef, CATEGORY_ORDER } from '../lib/categories.js';
import { t, categoryLabel } from '../lib/i18n.js';
import { $, settings, setSettings, sitesSource, iconFor, toast, send } from './core.js';
import { openSiteDetail } from './siteDetail.js';

const PIN_ICON = '<svg viewBox="0 0 24 24"><path d="M16 3l5 5-3.5 3.5L19 14l-1.5 1.5L14 12l-3 3 1 4-1.5 1.5L6 16l-4.5 4.5L0 19 4.5 14.5 1 11l1.5-1.5 4 1 3-3-3.5-3.5L8 2l5.5 5.5L16 3z"/></svg>';
export const SITES_CHUNK = 150;

/** What is currently listed: the filtered+sorted rows, how many are in the DOM, and where they came from. */
let view = { list: [], total: 1, src: null, shown: 0, pinned: new Set() };
const selected = new Set();
let observer = null;

function buildRow(s) {
  const catKey = categorize(s.domain, settings.categoryMap);
  const def = categoryDef(catKey);
  const pct = ((s.t / view.total) * 100).toFixed(1);
  const limit = settings.siteLimits[s.domain] || '';
  const isPinned = view.pinned.has(s.domain);
  const tr = document.createElement('tr');
  tr.dataset.domain = s.domain;
  tr.innerHTML = `
    <td class="select-cell"><input type="checkbox" class="row-select" aria-label="${t('bulk.selectRow', { d: s.domain })}" ${selected.has(s.domain) ? 'checked' : ''}></td>
    <td class="pin-cell"><button class="pin-btn${isPinned ? ' on' : ''}" data-domain="${s.domain}" title="${isPinned ? t('sites.unpin') : t('sites.pin')}" aria-label="${isPinned ? t('sites.unpin') : t('sites.pin')}">${PIN_ICON}</button></td>
    <td><div class="site-cell"><img src="${iconFor(s.domain)}" loading="lazy" alt=""><span class="dom">${s.domain}</span></div></td>
    <td><span class="cat-pill" style="background:${def.color}22;color:${def.color}">${categoryLabel(catKey)}</span></td>
    <td>${formatDuration(s.t)}</td>
    <td>${s.v}</td>
    <td><div class="share-mini"><div class="bar"><div class="fill" style="width:${pct}%"></div></div><span>${pct}%</span></div></td>
    <td><input type="number" class="limit-input" min="0" placeholder="—" value="${limit}" data-domain="${s.domain}" aria-label="${t('th.limit')}: ${s.domain}"></td>`;
  return tr;
}

function updateFooter() {
  const footer = $('#sitesFooter');
  const more = view.shown < view.list.length;
  footer.classList.toggle('hidden', !more);
  if (more) footer.textContent = t('sites.showing', { shown: view.shown, total: view.list.length });
}

function appendChunk() {
  const end = Math.min(view.list.length, view.shown + SITES_CHUNK);
  const rows = document.createDocumentFragment();
  for (let i = view.shown; i < end; i++) rows.appendChild(buildRow(view.list[i]));
  $('#sitesBody').appendChild(rows);
  view.shown = end;
  updateFooter();
  // Re-arm the sentinel: if it is still on screen (a tall window), load the next chunk too.
  if (observer && view.shown < view.list.length) {
    const sentinel = $('#sitesSentinel');
    observer.unobserve(sentinel);
    observer.observe(sentinel);
  }
}

function updateBulkBar() {
  $('#bulkBar').classList.toggle('hidden', selected.size === 0);
  $('#bulkCount').textContent = t('bulk.selected', { n: selected.size });
  const all = $('#selectAllSites');
  all.checked = view.list.length > 0 && view.list.every((s) => selected.has(s.domain));
}

export async function renderSites() {
  const src = await sitesSource();
  const term = $('#siteSearch').value.trim().toLowerCase();
  const sortBy = $('#siteSort').value;
  const pinned = new Set(settings.pinnedSites || []);
  let list = Object.values(src.agg);
  const total = list.reduce((a, s) => a + s.t, 0) || 1;
  if (term) list = list.filter((s) => s.domain.includes(term));
  list.sort((a, b) =>
    sortBy === 'visits' ? b.v - a.v : sortBy === 'name' ? a.domain.localeCompare(b.domain) : b.t - a.t);
  // Pinned sites float to the top, keeping their relative order from the sort above.
  list.sort((a, b) => (pinned.has(b.domain) ? 1 : 0) - (pinned.has(a.domain) ? 1 : 0));

  view = { list, total, src, shown: 0, pinned };
  $('#sitesBody').innerHTML = '';
  $('#sitesEmpty').classList.toggle('hidden', list.length > 0);
  appendChunk();
  updateBulkBar();
  renderBulkCategoryOptions();
}

function renderBulkCategoryOptions() {
  const select = $('#bulkCategory');
  select.innerHTML = `<option value="">${t('bulk.setCategory')}</option>`;
  for (const key of CATEGORY_ORDER) {
    const option = document.createElement('option');
    option.value = key;
    option.textContent = categoryLabel(key);
    select.appendChild(option);
  }
}

// ---- actions on one row ----
async function toggleSelected(domain, on) {
  if (on) selected.add(domain); else selected.delete(domain);
  updateBulkBar();
}

async function changeLimit(input) {
  const dom = input.dataset.domain;
  const val = parseInt(input.value, 10);
  setSettings(val > 0
    ? await setSettingsMapEntry('siteLimits', dom, val)
    : await removeSettingsMapEntry('siteLimits', dom));
  send('settingsChanged');
  toast(val > 0 ? t('toast.limitSaved', { d: dom }) : t('toast.limitRemoved', { d: dom }), 'success');
}

async function togglePin(domain) {
  const set = new Set(settings.pinnedSites || []);
  if (set.has(domain)) set.delete(domain); else set.add(domain);
  setSettings(await saveSettings({ pinnedSites: [...set] }));
  renderSites();
}

// ---- bulk actions: every one is a single settings write ----
async function applyBulk(kind, value) {
  const domains = [...selected];
  if (!domains.length) return;
  if (kind === 'category' && value) {
    setSettings(await setSettingsMapEntries('categoryMap', Object.fromEntries(domains.map((d) => [d, value]))));
  } else if (kind === 'limit') {
    const minutes = parseInt(value, 10);
    setSettings(minutes > 0
      ? await setSettingsMapEntries('siteLimits', Object.fromEntries(domains.map((d) => [d, minutes])))
      : await removeSettingsMapEntries('siteLimits', domains));
  } else if (kind === 'untrack') {
    setSettings(await saveSettings({ blacklist: [...new Set([...settings.blacklist, ...domains])] }));
  } else if (kind === 'pin') {
    setSettings(await saveSettings({ pinnedSites: [...new Set([...(settings.pinnedSites || []), ...domains])] }));
  } else if (kind === 'unpin') {
    const drop = new Set(domains);
    setSettings(await saveSettings({ pinnedSites: (settings.pinnedSites || []).filter((d) => !drop.has(d)) }));
  } else {
    return;
  }
  selected.clear();
  send('settingsChanged');
  toast(t('bulk.done', { n: domains.length }), 'success');
  renderSites();
}

/** One-time event wiring (delegated, so it covers rows added later). */
export function wireSites() {
  const body = $('#sitesBody');
  body.addEventListener('click', (e) => {
    const target = /** @type {HTMLElement} */ (e.target);
    const pin = target.closest('.pin-btn');
    if (pin) { e.stopPropagation(); togglePin(/** @type {HTMLElement} */ (pin).dataset.domain); return; }
    if (target.closest('.limit-input') || target.closest('.row-select')) return;
    const row = target.closest('tr');
    if (row) openSiteDetail(row.dataset.domain, view.src);
  });
  body.addEventListener('change', (e) => {
    const target = /** @type {HTMLInputElement} */ (e.target);
    if (target.classList.contains('limit-input')) changeLimit(target);
    else if (target.classList.contains('row-select')) toggleSelected(target.closest('tr').dataset.domain, target.checked);
  });

  $('#selectAllSites').addEventListener('change', (e) => {
    const on = /** @type {HTMLInputElement} */ (e.target).checked;
    for (const s of view.list) { if (on) selected.add(s.domain); else selected.delete(s.domain); }
    body.querySelectorAll('.row-select').forEach((box) => { /** @type {HTMLInputElement} */ (box).checked = on; });
    updateBulkBar();
  });
  $('#selectAllSites').setAttribute('aria-label', t('bulk.selectAll'));

  $('#bulkCategory').addEventListener('change', (e) => {
    const select = /** @type {HTMLSelectElement} */ (e.target);
    const value = select.value;
    select.value = '';
    applyBulk('category', value);
  });
  $('#bulkSetLimit').addEventListener('click', () => applyBulk('limit', $('#bulkLimit').value));
  $('#bulkUntrack').addEventListener('click', () => applyBulk('untrack'));
  $('#bulkPin').addEventListener('click', () => applyBulk('pin'));
  $('#bulkUnpin').addEventListener('click', () => applyBulk('unpin'));
  $('#bulkClear').addEventListener('click', () => { selected.clear(); body.querySelectorAll('.row-select').forEach((box) => { /** @type {HTMLInputElement} */ (box).checked = false; }); updateBulkBar(); });

  if (typeof IntersectionObserver !== 'undefined') {
    observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting) && view.shown < view.list.length) appendChunk();
    }, { rootMargin: '600px' });
    observer.observe($('#sitesSentinel'));
  }
}
