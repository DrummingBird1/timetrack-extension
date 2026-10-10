// Weekly per-category time budgets: the Settings editor and the Overview progress panel.
// (Notifications at 80% / 100% are raised by the service worker — see checkLimits().)
import { getDays, setSettingsMapEntry, removeSettingsMapEntry } from '../lib/storage.js';
import { startOfWeek, keysBetween, formatDuration } from '../lib/utils.js';
import { budgetStatus } from '../lib/stats.js';
import { CATEGORY_ORDER, categoryDef } from '../lib/categories.js';
import { t, categoryLabel } from '../lib/i18n.js';
import { $, settings, setSettings, toast, send } from './core.js';

// ---- Settings: editor ----
export function renderBudgetEditor() {
  const select = $('#budgetCat');
  const previous = select.value;
  select.innerHTML = '';
  for (const key of CATEGORY_ORDER) {
    const option = document.createElement('option');
    option.value = key;
    option.textContent = categoryLabel(key);
    select.appendChild(option);
  }
  if (previous) select.value = previous;

  const list = $('#budgetList');
  list.innerHTML = '';
  const entries = Object.entries(settings.categoryBudgets || {});
  if (!entries.length) {
    list.innerHTML = `<span style="color:var(--text-faint);font-size:12.5px">${t('budget.none')}</span>`;
    return;
  }
  for (const [key, minutes] of entries) {
    const chip = document.createElement('div');
    chip.className = 'cat-chip';
    chip.innerHTML = `<span class="dot" style="background:${categoryDef(key).color}"></span>
      <span>${categoryLabel(key)} · ${formatDuration(minutes * 60)}</span>
      <span class="x" role="button" tabindex="0" aria-label="${t('btn.remove')}">✕</span>`;
    const remove = async () => {
      setSettings(await removeSettingsMapEntry('categoryBudgets', key));
      renderBudgetEditor();
      toast(t('toast.budgetRemoved', { c: categoryLabel(key) }), 'success');
    };
    const x = chip.querySelector('.x');
    x.addEventListener('click', remove);
    x.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); remove(); } });
    list.appendChild(chip);
  }
}

export async function addBudget() {
  const key = $('#budgetCat').value;
  const minutes = Math.round(Number($('#budgetMinutes').value));
  if (!(minutes > 0)) { toast(t('budget.badMinutes'), 'error'); return; }
  setSettings(await setSettingsMapEntry('categoryBudgets', key, minutes));
  $('#budgetMinutes').value = '';
  renderBudgetEditor();
  toast(t('toast.budgetSaved', { c: categoryLabel(key) }), 'success');
}

// ---- Overview: this week's progress ----
export async function renderBudgetPanel() {
  const wrap = $('#budgetWrap');
  const budgets = settings.categoryBudgets || {};
  const hasBudgets = Object.values(budgets).some((m) => m > 0);
  wrap.classList.toggle('hidden', !hasBudgets);
  if (!hasBudgets) return;

  const days = await getDays(keysBetween(startOfWeek(new Date(), settings.weekStart), new Date()));
  const host = $('#budgetPanel');
  host.innerHTML = '';
  for (const s of budgetStatus(days, settings.categoryMap, budgets)) {
    const color = categoryDef(s.key).color;
    const over = s.pct >= 100;
    const row = document.createElement('div');
    row.className = 'cb-row';
    row.innerHTML = `
      <div class="cb-top">
        <span class="lbl"><span class="cb-dot" style="background:${color}"></span>${categoryLabel(s.key)}</span>
        <span class="cb-time">${t('budget.used', { used: formatDuration(s.usedSeconds), limit: formatDuration(s.limitSeconds) })} · ${Math.round(s.pct)}%</span>
      </div>
      <div class="cb-track"><div class="cb-fill" style="width:${Math.min(100, Math.max(2, s.pct))}%;background:${over ? 'var(--danger)' : s.pct >= 80 ? 'var(--warn, #fbbf24)' : color}"></div></div>`;
    host.appendChild(row);
  }
}

export function wireBudgets() {
  $('#budgetAdd').addEventListener('click', async () => { await addBudget(); send('settingsChanged'); });
  $('#budgetMinutes').addEventListener('keydown', async (e) => { if (e.key === 'Enter') { await addBudget(); send('settingsChanged'); } });
}
