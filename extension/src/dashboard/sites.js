// Sites tab: searchable / sortable table, pinning, per-site daily limits.
import { saveSettings, saveSettingsKey } from '../lib/storage.js';
import { formatDuration } from '../lib/utils.js';
import { categorize, categoryDef } from '../lib/categories.js';
import { t, categoryLabel } from '../lib/i18n.js';
import { $, settings, setSettings, sitesSource, iconFor, toast, send } from './core.js';
import { openSiteDetail } from './siteDetail.js';

const PIN_ICON = '<svg viewBox="0 0 24 24"><path d="M16 3l5 5-3.5 3.5L19 14l-1.5 1.5L14 12l-3 3 1 4-1.5 1.5L6 16l-4.5 4.5L0 19 4.5 14.5 1 11l1.5-1.5 4 1 3-3-3.5-3.5L8 2l5.5 5.5L16 3z"/></svg>';

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

  const body = $('#sitesBody');
  body.innerHTML = '';
  $('#sitesEmpty').classList.toggle('hidden', list.length > 0);

  for (const s of list) {
    const catKey = categorize(s.domain, settings.categoryMap);
    const def = categoryDef(catKey);
    const pct = ((s.t / total) * 100).toFixed(1);
    const limit = settings.siteLimits[s.domain] || '';
    const isPinned = pinned.has(s.domain);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="pin-cell"><button class="pin-btn${isPinned ? ' on' : ''}" data-domain="${s.domain}" title="${isPinned ? t('sites.unpin') : t('sites.pin')}">${PIN_ICON}</button></td>
      <td><div class="site-cell"><img src="${iconFor(s.domain)}" loading="lazy" alt=""><span class="dom">${s.domain}</span></div></td>
      <td><span class="cat-pill" style="background:${def.color}22;color:${def.color}">${categoryLabel(catKey)}</span></td>
      <td>${formatDuration(s.t)}</td>
      <td>${s.v}</td>
      <td><div class="share-mini"><div class="bar"><div class="fill" style="width:${pct}%"></div></div><span>${pct}%</span></div></td>
      <td><input type="number" class="limit-input" min="0" placeholder="—" value="${limit}" data-domain="${s.domain}"></td>`;
    tr.addEventListener('click', (e) => { if (!e.target.closest('.limit-input') && !e.target.closest('.pin-btn')) openSiteDetail(s.domain, src); });
    body.appendChild(tr);
  }

  body.querySelectorAll('.limit-input').forEach((inp) => {
    inp.addEventListener('click', (e) => e.stopPropagation());
    inp.addEventListener('change', async () => {
      const dom = inp.dataset.domain;
      const val = parseInt(inp.value, 10);
      const siteLimits = { ...settings.siteLimits };
      if (val > 0) siteLimits[dom] = val; else delete siteLimits[dom];
      setSettings(await saveSettingsKey('siteLimits', siteLimits));
      send('settingsChanged');
      toast(val > 0 ? t('toast.limitSaved', { d: dom }) : t('toast.limitRemoved', { d: dom }), 'success');
    });
  });

  body.querySelectorAll('.pin-btn').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const dom = btn.dataset.domain;
      const set = new Set(settings.pinnedSites || []);
      if (set.has(dom)) set.delete(dom); else set.add(dom);
      setSettings(await saveSettings({ pinnedSites: [...set] }));
      renderSites();
    });
  });
}
