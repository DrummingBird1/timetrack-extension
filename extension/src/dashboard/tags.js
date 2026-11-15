// Tags: your own groups of sites ("Work", "Uni", "Side project"). The Settings editor creates
// them; the Overview panel shows the time each one took in the selected range. A site can carry
// several tags, and a tag entry covers its subdomains too.
import { setSettingsMapEntry, removeSettingsMapEntry } from '../lib/storage.js';
import { cleanTagName, cleanDomain, formatDuration, esc } from '../lib/utils.js';
import { tagSeconds } from '../lib/stats.js';
import { t } from '../lib/i18n.js';
import { $, settings, setSettings, cache, toast, send } from './core.js';

const MAX_TAGS = 30;

// ---- Settings: editor ----
export function renderTagEditor() {
  const list = $('#tagList');
  list.innerHTML = '';
  const entries = Object.entries(settings.tags || {});
  if (!entries.length) {
    list.innerHTML = `<span style="color:var(--text-faint);font-size:12.5px">${t('tags.none')}</span>`;
    return;
  }
  for (const [name, domains] of entries) {
    const chip = document.createElement('div');
    chip.className = 'cat-chip';
    chip.innerHTML = `<span><b>${esc(name)}</b> · ${esc(domains.slice(0, 3).join(', '))}${domains.length > 3 ? ` +${domains.length - 3}` : ''}</span>
      <span class="x" role="button" tabindex="0" aria-label="${esc(t('btn.remove'))}">✕</span>`;
    const remove = async () => {
      setSettings(await removeSettingsMapEntry('tags', name));
      renderTagEditor();
      toast(t('tags.removed', { n: name }), 'success');
      send('settingsChanged');
    };
    const x = chip.querySelector('.x');
    x.addEventListener('click', remove);
    x.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); remove(); } });
    list.appendChild(chip);
  }
}

export async function addTag() {
  const name = cleanTagName($('#tagName').value);
  if (!name) { toast(t('tags.badName'), 'error'); return; }
  const domains = [...new Set($('#tagDomains').value.split(/[,\s]+/).map(cleanDomain).filter(Boolean))];
  if (!domains.length) { toast(t('tags.noDomains'), 'error'); return; }
  if (!(name in (settings.tags || {})) && Object.keys(settings.tags || {}).length >= MAX_TAGS) {
    toast(t('tags.tooMany', { n: MAX_TAGS }), 'error');
    return;
  }
  setSettings(await setSettingsMapEntry('tags', name, domains.slice(0, 200)));
  $('#tagName').value = '';
  $('#tagDomains').value = '';
  renderTagEditor();
  toast(t('tags.saved', { n: name }), 'success');
  send('settingsChanged');
}

export function wireTags() {
  $('#tagAdd').addEventListener('click', addTag);
  $('#tagDomains').addEventListener('keydown', (e) => { if (e.key === 'Enter') addTag(); });
}

// ---- Overview: time per tag in the selected range ----
export function renderTagPanel() {
  const wrap = $('#tagWrap');
  const rows = tagSeconds(cache.days, settings.tags || {});
  wrap.classList.toggle('hidden', !rows.length);
  if (!rows.length) return;
  const max = rows[0].seconds;
  const host = $('#tagPanel');
  host.innerHTML = '';
  for (const r of rows) {
    const row = document.createElement('div');
    row.className = 'cb-row';
    row.innerHTML = `
      <div class="cb-top">
        <span class="lbl">${esc(r.tag)}</span>
        <span class="cb-time">${formatDuration(r.seconds)} · ${t('tags.sites', { n: r.sites })}</span>
      </div>
      <div class="cb-track"><div class="cb-fill" style="width:${Math.max(2, (r.seconds / max) * 100)}%;background:var(--accent)"></div></div>`;
    host.appendChild(row);
  }
}
