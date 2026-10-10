// Settings-tab list editors: focus categories/domains, never-track list, category mappings.
import { saveSettings, setSettingsMapEntry, removeSettingsMapEntry } from '../lib/storage.js';
import { weekdaysShort } from '../lib/utils.js';
import { CATEGORY_DEFS, CATEGORY_ORDER, categoryDef } from '../lib/categories.js';
import { t, categoryLabel } from '../lib/i18n.js';
import { $, settings, setSettings, toast, send, cleanDomain, actions, wireRemove } from './core.js';

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
      const checked = /** @type {HTMLInputElement} */ (e.target).checked;
      if (checked) set.add(key); else set.delete(key);
      setSettings(await saveSettings({ focus: { [settingKey]: [...set] } }));
      label.classList.toggle('on', checked);
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
    wireRemove(chip, async () => {
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
    wireRemove(chip, async () => {
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
    wireRemove(chip, async () => {
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

// ---- scheduled focus sessions (settings.focus.schedule) ----
export function renderSchedule() {
  const daysHost = $('#scheduleDays');
  const checked = new Set([...daysHost.querySelectorAll('input:checked')].map((i) => Number(i.value)));
  const names = weekdaysShort(settings.language);
  daysHost.innerHTML = '';
  for (let day = 0; day < 7; day++) {
    const label = document.createElement('label');
    label.className = `chip-check${checked.has(day) ? ' on' : ''}`;
    label.innerHTML = `<input type="checkbox" value="${day}" ${checked.has(day) ? 'checked' : ''}>${names[day]}`;
    label.querySelector('input').addEventListener('change', (e) => label.classList.toggle('on', /** @type {HTMLInputElement} */ (e.target).checked));
    daysHost.appendChild(label);
  }

  const list = $('#scheduleList');
  list.innerHTML = '';
  const entries = settings.focus.schedule || [];
  if (!entries.length) {
    list.innerHTML = `<span style="color:var(--text-faint);font-size:12.5px">${t('schedule.none')}</span>`;
    return;
  }
  entries.forEach((slot, index) => {
    const chip = document.createElement('div');
    chip.className = 'cat-chip';
    const dayNames = slot.days.map((d) => names[d]).join(' ');
    chip.innerHTML = `<span>${t('schedule.entry', { days: dayNames, time: slot.time, m: slot.minutes })}</span>
      <span class="x" role="button" tabindex="0" aria-label="${t('btn.remove')}">✕</span>`;
    const remove = async () => {
      setSettings(await saveSettings({ focus: { schedule: entries.filter((_, i) => i !== index) } }));
      renderSchedule();
      send('settingsChanged');
    };
    const x = chip.querySelector('.x');
    x.addEventListener('click', remove);
    x.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); remove(); } });
    list.appendChild(chip);
  });
}

export async function addScheduleEntry() {
  const days = [...$('#scheduleDays').querySelectorAll('input:checked')].map((i) => Number(i.value));
  const time = $('#scheduleTime').value;
  const minutes = Math.max(1, Math.min(240, Math.round(Number($('#scheduleMinutes').value) || settings.focus.defaultMinutes || 25)));
  if (!days.length || !/^\d{2}:\d{2}$/.test(time)) { toast(t('schedule.pickDays'), 'error'); return; }
  const next = [...(settings.focus.schedule || []), { days, time, minutes }];
  setSettings(await saveSettings({ focus: { schedule: next } }));
  renderSchedule();
  send('settingsChanged');
  toast(t('toast.scheduleSaved'), 'success');
}
