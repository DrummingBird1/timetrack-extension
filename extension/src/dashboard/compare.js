// Period comparison panels on the Overview: this week vs last week, and any two ranges.
import { getDays } from '../lib/storage.js';
import { dayKey, parseDayKey, addDays, startOfWeek, keysBetween, rangeKeys, formatDuration } from '../lib/utils.js';
import { aggregateDomains, totalTime, byCategory, focusScore, siteChanges } from '../lib/stats.js';
import { t } from '../lib/i18n.js';
import { $, settings, toast, iconFor, productiveTime } from './core.js';

export async function renderCompare() {
  const thisKeys = rangeKeys(7);
  const lastKeys = rangeKeys(7, addDays(parseDayKey(thisKeys[0]), -1));
  const [tw, lw] = await Promise.all([getDays(thisKeys), getDays(lastKeys)]);
  const host = $('#comparePanel');
  const twTotal = totalTime(tw);
  const lwTotal = totalTime(lw);
  if (!twTotal && !lwTotal) { host.innerHTML = `<div class="empty">${t('compare.noData')}</div>`; return; }

  const twCats = byCategory(aggregateDomains(tw), settings.categoryMap);
  const lwCats = byCategory(aggregateDomains(lw), settings.categoryMap);
  const twProd = productiveTime(twCats);
  const lwProd = productiveTime(lwCats);
  const twScore = focusScore(twCats) || 0;
  const lwScore = focusScore(lwCats) || 0;

  const goal = settings.weeklyGoalMinutes * 60;
  const prodSuffix = goal > 0 ? ` · ${t('compare.ofGoal', { v: formatDuration(goal) })}` : '';

  host.innerHTML = '';
  host.appendChild(compareRow(t('compare.total'), twTotal, lwTotal, formatDuration));
  host.appendChild(compareRow(t('card.productive') + prodSuffix, twProd, lwProd, formatDuration, goal || undefined));
  host.appendChild(compareRow(t('card.focusScore'), twScore, lwScore, (v) => `${Math.round(v)}/100`, 100));
}

function compareRow(label, now, prev, fmt, max, tags = [t('compare.thisWeek'), t('compare.lastWeek')]) {
  const top = max || Math.max(now, prev, 1);
  const delta = prev ? Math.round(((now - prev) / prev) * 100) : null;
  const row = document.createElement('div');
  row.className = 'cmp-row';
  const deltaCls = delta == null ? 'flat' : (delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat');
  const deltaTxt = delta == null ? '' : `${delta > 0 ? '▲' : delta < 0 ? '▼' : ''} ${Math.abs(delta)}%`;
  row.innerHTML = `
    <div class="cmp-label"><span>${label}</span><span class="delta ${deltaCls}">${deltaTxt}</span></div>
    <div class="cmp-bars">
      <div class="cmp-bar"><span class="tag">${tags[0]}</span>
        <span class="track"><span class="fill now" style="width:${Math.max(2, (now / top) * 100)}%"></span></span>
        <span class="v">${fmt(now)}</span></div>
      <div class="cmp-bar"><span class="tag">${tags[1]}</span>
        <span class="track"><span class="fill prev" style="width:${Math.max(2, (prev / top) * 100)}%"></span></span>
        <span class="v">${fmt(prev)}</span></div>
    </div>`;
  return row;
}


// ---- compare any two date ranges ----
const parseInputDate = (id) => {
  const value = $(id).value;
  return value ? parseDayKey(value) : null;
};

async function loadRangeDays(from, to) {
  return getDays(keysBetween(from, to));
}

export async function runCustomCompare() {
  const host = $('#customCompareResult');
  const [fromA, toA, fromB, toB] = ['#cmpFromA', '#cmpToA', '#cmpFromB', '#cmpToB'].map(parseInputDate);
  if (![fromA, toA, fromB, toB].every(Boolean) || fromA > toA || fromB > toB) {
    toast(t('compare.badRange'), 'error');
    return;
  }
  const [daysA, daysB] = await Promise.all([loadRangeDays(fromA, toA), loadRangeDays(fromB, toB)]);
  const aggA = aggregateDomains(daysA);
  const aggB = aggregateDomains(daysB);
  const catsA = byCategory(aggA, settings.categoryMap);
  const catsB = byCategory(aggB, settings.categoryMap);
  const tags = [t('compare.rangeA'), t('compare.rangeB')];

  host.innerHTML = '';
  host.appendChild(compareRow(t('compare.total'), totalTime(daysA), totalTime(daysB), formatDuration, undefined, tags));
  host.appendChild(compareRow(t('card.productive'), productiveTime(catsA), productiveTime(catsB), formatDuration, undefined, tags));
  host.appendChild(compareRow(t('card.focusScore'), focusScore(catsA) || 0, focusScore(catsB) || 0, (v) => `${Math.round(v)}/100`, 100, tags));

  const changes = siteChanges(aggA, aggB, 5);
  if (changes.length) {
    const block = document.createElement('div');
    block.innerHTML = `<div class="detail-section-title">${t('compare.topChanges')}</div>`;
    for (const c of changes) {
      const row = document.createElement('div');
      row.className = 'tl-row';
      row.innerHTML = `
        <img src="${iconFor(c.domain)}" loading="lazy" alt="" />
        <span class="tl-name" title="${c.domain}">${c.domain}</span>
        <span class="tl-time" style="color:var(--${c.delta > 0 ? 'danger' : 'green'})">${c.delta > 0 ? '▲' : '▼'} ${formatDuration(Math.abs(c.delta))}</span>`;
      block.appendChild(row);
    }
    host.appendChild(block);
  }
}

/** Prefill the two ranges with "this week" and "last week", then wire the button. */
export function wireCustomCompare() {
  const thisStart = startOfWeek(new Date(), settings.weekStart);
  const lastStart = addDays(thisStart, -7);
  $('#cmpFromA').value = dayKey(thisStart);
  $('#cmpToA').value = dayKey(new Date());
  $('#cmpFromB').value = dayKey(lastStart);
  $('#cmpToB').value = dayKey(addDays(thisStart, -1));
  $('#cmpRun').addEventListener('click', runCustomCompare);
}
