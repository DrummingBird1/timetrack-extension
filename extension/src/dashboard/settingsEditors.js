// Settings-tab list editors: focus categories/domains, never-track list, category mappings.
import { saveSettings, setSettingsMapEntry, removeSettingsMapEntry } from '../lib/storage.js';
import { CATEGORY_DEFS, CATEGORY_ORDER, categoryDef } from '../lib/categories.js';
import { t, categoryLabel } from '../lib/i18n.js';
import { $, settings, setSettings, toast, send, cleanDomain, actions } from './core.js';

export function updateFocusModeFields() {
  const allow = settings.focus.mode === 'allow';
  $('#focusBlockField').classList.toggle('hidden', allow);
  $('#focusAllowField').classList.toggle('hidden', !allow);
}

export function renderFocusCats(hostSel, settingKey) {
  const host = $(hostSel);
  host.innerHTML = '';
  const chosen = new Set(settings.focus[settingKey]);
  for (const key of CATEGORY_ORDER) {
    if (key === 'other') continue;
    const def = CATEGORY_DEFS[key];
    const label = document.createElement('label');
    label.className = 'chip-check' + (chosen.has(key) ? ' on' : '');
    label.innerHTML = `<input type="checkbox" ${chosen.has(key) ? 'checked' : ''}>
      <span class="dot" style="background:${def.color}"></span>${categoryLabel(key)}`;
    label.querySelector('input').addEventListener('change', async (e) => {
      const set = new Set(settings.focus[settingKey]);
      if (e.target.checked) set.add(key); else set.delete(key);
      setSettings(await saveSettings({ focus: { [settingKey]: [...set] } }));
      label.classList.toggle('on', e.target.checked);
    });
    host.appendChild(label);
  }
}

// Removable chips for a focus domain list (blockDomains / allowDomains).
export function renderFocusDomains(hostSel, settingKey) {
  const host = $(hostSel);
  host.innerHTML = '';
  for (const domain of settings.focus[settingKey] || []) {
    const chip = document.createElement('div');
    chip.className = 'cat-chip';
    chip.innerHTML = `<span>${domain}</span><span class="x">✕</span>`;
    chip.querySelector('.x').addEventListener('click', async () => {
      const next = (settings.focus[settingKey] || []).filter((d) => d !== domain);
      setSettings(await saveSettings({ focus: { [settingKey]: next } }));
      renderFocusDomains(hostSel, settingKey);
    });
    host.appendChild(chip);
  }
}

export async function addFocusDomain(inputSel, settingKey, hostSel) {
  const input = $(inputSel);
  if (!input.value.trim()) return;
  const domain = cleanDomain(input.value);
  if (!domain) { toast(t('toast.badDomain'), 'error'); return; }
  const set = new Set(settings.focus[settingKey] || []);
  set.add(domain);
  setSettings(await saveSettings({ focus: { [settingKey]: [...set] } }));
  input.value = '';
  renderFocusDomains(hostSel, settingKey);
}

// ---- never-track blacklist editor ----
export function renderBlacklist() {
  const list = $('#blacklistList');
  list.innerHTML = '';
  const entries = settings.blacklist || [];
  if (!entries.length) {
    list.innerHTML = `<span style="color:var(--text-faint);font-size:12.5px">${t('blacklist.none')}</span>`;
    return;
  }
  for (const domain of entries) {
    const chip = document.createElement('div');
    chip.className = 'cat-chip';
    chip.innerHTML = `<span>🚫 ${domain}</span><span class="x">✕</span>`;
    chip.querySelector('.x').addEventListener('click', async () => {
      const next = (settings.blacklist || []).filter((d) => d !== domain);
      setSettings(await saveSettings({ blacklist: next }));
      await send('settingsChanged');
      renderBlacklist();
      toast(t('toast.blacklistRemoved', { d: domain }), 'success');
    });
    list.appendChild(chip);
  }
}

export async function addBlacklist() {
  const input = $('#blacklistDomain');
  if (!input.value.trim()) return;
  const domain = cleanDomain(input.value);
  if (!domain) { toast(t('toast.badDomain'), 'error'); return; }
  const set = new Set(settings.blacklist || []);
  set.add(domain);
  setSettings(await saveSettings({ blacklist: [...set] }));
  await send('settingsChanged');
  input.value = '';
  renderBlacklist();
  toast(t('toast.blacklistAdded', { d: domain }), 'success');
}

// ---- category editor ----
export function renderCategoryEditor() {
  const sel = $('#catSelect');
  sel.innerHTML = '';
  for (const key of CATEGORY_ORDER) {
    const o = document.createElement('option');
    o.value = key; o.textContent = categoryLabel(key);
    sel.appendChild(o);
  }
  const list = $('#catList');
  list.innerHTML = '';
  const entries = Object.entries(settings.categoryMap);
  if (!entries.length) { list.innerHTML = `<span style="color:var(--text-faint);font-size:12.5px">${t('cat.none')}</span>`; return; }
  for (const [domain, cat] of entries) {
    const def = categoryDef(cat);
    const chip = document.createElement('div');
    chip.className = 'cat-chip';
    chip.innerHTML = `<span class="dot" style="background:${def.color}"></span>
      <span>${domain} → ${categoryLabel(cat)}</span>
      <span class="x" data-domain="${domain}">✕</span>`;
    chip.querySelector('.x').addEventListener('click', async () => {
      setSettings(await removeSettingsMapEntry('categoryMap', domain));
      renderCategoryEditor();
      actions.rerenderCharts();
    });
    list.appendChild(chip);
  }
}

export async function addCategoryMapping() {
  const domain = $('#catDomain').value.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '');
  const cat = $('#catSelect').value;
  if (!domain) return;
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) { toast(t('toast.badDomain'), 'error'); return; }
  setSettings(await setSettingsMapEntry('categoryMap', domain, cat));
  $('#catDomain').value = '';
  renderCategoryEditor();
  actions.rerenderCharts();
  toast(t('toast.catSaved', { d: domain, c: categoryLabel(cat) }), 'success');
}
