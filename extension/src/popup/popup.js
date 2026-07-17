import { getDays, getSettings } from '../lib/storage.js';
import {
  dayKey, rangeKeys, formatDuration, formatClock, favicon, weekdaysShort, parseDayKey,
} from '../lib/utils.js';
import { aggregateDomains, topSites, dailyTotals } from '../lib/stats.js';
import { barChart } from '../lib/charts.js';
import { setLang, t, dir, locale, localize } from '../lib/i18n.js';

const $ = (id) => document.getElementById(id);
let live = null;
let liveTimer = null;
let focusTimer = null;
let settings = null;

function msg(type, extra = {}) {
  return chrome.runtime.sendMessage({ type, ...extra }).catch(() => ({}));
}

function iconFor(domain) {
  if (settings && settings.realFavicons) {
    return `${chrome.runtime.getURL('_favicon/')}?pageUrl=${encodeURIComponent('https://' + domain)}&size=32`;
  }
  return favicon(domain);
}

function applyLang() {
  setLang(settings.language || 'he');
  document.documentElement.lang = settings.language === 'en' ? 'en' : 'he';
  document.documentElement.dir = dir();
  if (settings.theme === 'light') document.documentElement.style.colorScheme = 'light';
  else if (settings.theme === 'dark') document.documentElement.style.colorScheme = 'dark';
  localize(document);
}

function todaySummary(todayDay) {
  const domains = todayDay?.domains || {};
  let total = 0;
  let count = 0;
  for (const rec of Object.values(domains)) { total += rec.t || 0; if (rec.t > 0) count++; }
  return { total, count };
}

async function render() {
  live = await msg('getLive');

  $('dateLabel').textContent = new Date().toLocaleDateString(locale(), {
    weekday: 'long', day: 'numeric', month: 'long',
  });
  $('enabledToggle').checked = live.enabled;

  const nowCard = $('nowCard');
  if (live.counting && live.currentDomain) {
    nowCard.classList.add('live');
    $('nowDomain').textContent = live.currentDomain;
    $('nowFavicon').src = iconFor(live.currentDomain);
    $('nowFavicon').style.visibility = 'visible';
  } else {
    nowCard.classList.remove('live');
    $('nowDomain').textContent = live.enabled ? t('popup.notActive') : t('popup.paused');
    $('nowFavicon').style.visibility = 'hidden';
  }

  const { total: todayTotal, count } = todaySummary(live.today);
  $('todayTotal').textContent = formatDuration(todayTotal);
  $('siteCount').textContent = count;

  const keys = rangeKeys(7);
  const days = await getDays(keys);
  const totals = dailyTotals(days, keys);
  const weekTotal = totals.reduce((a, d) => a + d.t, 0);
  $('weekTotal').textContent = formatDuration(weekTotal);

  const wd = weekdaysShort(settings.language);
  barChart($('weekChart'), totals.map((d) => ({
    label: wd[parseDayKey(d.key).getDay()],
    value: d.t,
    title: `${parseDayKey(d.key).toLocaleDateString(locale())}: ${formatDuration(d.t)}`,
  })), { height: 64, valueFmt: formatDuration });

  const agg = aggregateDomains({ today: live.today });
  const top = topSites(agg, 5);
  const list = $('topList');
  list.textContent = '';
  if (!top.length || todayTotal === 0) {
    $('emptyState').classList.remove('hidden');
  } else {
    $('emptyState').classList.add('hidden');
    const max = top[0].t || 1;
    for (const s of top) {
      const li = document.createElement('li');
      li.className = 'top-row';
      li.innerHTML = `
        <img src="${iconFor(s.domain)}" alt="" loading="lazy" />
        <span class="name" title="${s.domain}">${s.domain}</span>
        <span class="bar-wrap"><span class="bar-fill" style="width:${Math.max(4, (s.t / max) * 100)}%"></span></span>
        <span class="time">${formatDuration(s.t)}</span>`;
      list.appendChild(li);
    }
  }

  startLiveCounter();
}

function startLiveCounter() {
  if (liveTimer) clearInterval(liveTimer);
  const startedAt = Date.now();
  const base = live.liveSeconds || 0;
  const tick = () => {
    if (!live.counting) { $('nowTime').textContent = formatClock(0); return; }
    $('nowTime').textContent = formatClock(base + (Date.now() - startedAt) / 1000);
  };
  tick();
  if (live.counting) liveTimer = setInterval(tick, 1000);
}

async function renderFocus() {
  const focus = await msg('getFocus');
  const idle = $('focusIdle');
  const active = $('focusActive');
  if (focusTimer) { clearInterval(focusTimer); focusTimer = null; }

  if (focus && focus.active) {
    idle.classList.add('hidden');
    active.classList.remove('hidden');
    const label = document.querySelector('.focus-label');
    const phaseTxt = focus.phase === 'break' ? t('popup.phaseBreak') : t('popup.phaseWork');
    const cyc = focus.totalCycles > 1 ? ' · ' + t('popup.cycle', { n: focus.cycle, total: focus.totalCycles }) : '';
    if (label) label.textContent = phaseTxt + cyc;
    $('focusActive').classList.toggle('is-break', focus.phase === 'break');
    const endsAt = focus.endsAt;
    const upd = () => {
      const remaining = Math.max(0, (endsAt - Date.now()) / 1000);
      $('focusTimer').textContent = formatClock(remaining);
      if (remaining <= 0) { clearInterval(focusTimer); renderFocus(); render(); }
    };
    upd();
    focusTimer = setInterval(upd, 1000);
  } else {
    active.classList.add('hidden');
    idle.classList.remove('hidden');
    $('focusMin').value = settings.focus.defaultMinutes || 25;
  }
}

// Events
$('enabledToggle').addEventListener('change', async (e) => {
  await msg('setEnabled', { value: e.target.checked });
  render();
});

$('startFocus').addEventListener('click', async () => {
  const minutes = Math.max(1, Math.min(240, parseInt($('focusMin').value, 10) || 25));
  await msg('startFocus', { minutes });
  renderFocus();
});

$('endFocus').addEventListener('click', async () => {
  await msg('stopFocus');
  renderFocus();
});

$('openDashboard').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
  window.close();
});

// If real favicons were enabled but the optional `favicon` permission was later
// revoked from Chrome, fall back to generated avatars so icons never break.
async function ensureFaviconPermission() {
  if (!settings.realFavicons) return;
  try {
    const ok = await chrome.permissions.contains({ permissions: ['favicon'] });
    if (!ok) settings.realFavicons = false;
  } catch { /* permissions API edge — keep current setting */ }
}

async function init() {
  settings = await getSettings();
  await ensureFaviconPermission();
  applyLang();
  await render();
  await renderFocus();
}

init();
