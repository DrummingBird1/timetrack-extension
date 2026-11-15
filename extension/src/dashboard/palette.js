// Command palette (Ctrl/Cmd+K): jump to a screen, open a site's details, or run a common action,
// all from the keyboard. Results are built when it opens, from what is already on screen.
import { topSites } from '../lib/stats.js';
import { t } from '../lib/i18n.js';
import { $, $$, cache, closeModal } from './core.js';
import { openSiteDetail } from './siteDetail.js';
import { exportData } from './dataio.js';

const MAX_RESULTS = 12;
let items = [];        // everything searchable right now: { id, label, kind, run }
let shown = [];        // the filtered, rendered subset
let active = 0;

function buildItems() {
  const out = [];
  for (const btn of $$('.nav-item[data-tab]')) {
    out.push({ kind: 'page', label: btn.textContent.trim().replace(/\s+/g, ' '), run: () => btn.click() });
  }
  out.push({ kind: 'action', label: t('palette.cmd.toggleTracking'), run: () => { const c = $('#setEnabled'); c.checked = !c.checked; c.dispatchEvent(new Event('change', { bubbles: true })); } });
  out.push({ kind: 'action', label: t('palette.cmd.backupNow'), run: () => $('#backupNow').click() });
  out.push({ kind: 'action', label: t('palette.cmd.exportJson'), run: () => exportData() });
  for (const s of topSites(cache.agg || {}, 150)) {
    out.push({ kind: 'site', label: s.domain, run: () => openSiteDetail(s.domain) });
  }
  return out.map((it, i) => ({ ...it, id: `pal-${i}` }));
}

function filter(query) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const hit = (it) => words.every((w) => it.label.toLowerCase().includes(w));
  const matches = items.filter(hit);
  // Screens and actions first (they are few), then sites by time, which is the order they were added.
  return matches.slice(0, MAX_RESULTS);
}

function render() {
  const list = $('#paletteList');
  list.innerHTML = '';
  if (!shown.length) {
    list.innerHTML = `<li class="palette-empty" role="presentation">${t('palette.empty')}</li>`;
    $('#paletteInput').removeAttribute('aria-activedescendant');
    return;
  }
  shown.forEach((it, i) => {
    const li = document.createElement('li');
    li.id = it.id;
    li.setAttribute('role', 'option');
    li.setAttribute('aria-selected', String(i === active));
    li.className = `palette-item${i === active ? ' active' : ''}`;
    const label = document.createElement('span');
    label.textContent = it.label;
    const kind = document.createElement('span');
    kind.className = 'palette-kind';
    kind.textContent = t(`palette.kind.${it.kind}`);
    li.append(label, kind);
    li.addEventListener('mousemove', () => { if (active !== i) { active = i; render(); } });
    li.addEventListener('click', () => choose(i));
    list.appendChild(li);
  });
  $('#paletteInput').setAttribute('aria-activedescendant', shown[active].id);
  list.children[active]?.scrollIntoView({ block: 'nearest' });
}

function choose(i) {
  const it = shown[i];
  if (!it) return;
  closePalette();
  it.run();
}

export function openPalette() {
  items = buildItems();
  active = 0;
  closeModal();
  $('#paletteInput').value = '';
  shown = filter('');
  render();
  $('#paletteModal').classList.remove('hidden');
  $('#paletteInput').focus();
}

export function closePalette() {
  $('#paletteModal').classList.add('hidden');
}

export function wirePalette() {
  const input = $('#paletteInput');
  input.addEventListener('input', () => { active = 0; shown = filter(input.value); render(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!shown.length) return;
      active = (active + (e.key === 'ArrowDown' ? 1 : -1) + shown.length) % shown.length;
      render();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      choose(active);
    }
  });
  $('#paletteModal').addEventListener('click', (e) => { if (e.target.id === 'paletteModal') closePalette(); });
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      if ($('#paletteModal').classList.contains('hidden')) openPalette(); else closePalette();
    }
  });
}
