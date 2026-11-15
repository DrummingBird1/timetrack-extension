// The first-run welcome: three short steps (what it is, a quick setup, a few tips). The quick setup
// does not save anything itself: it sets the matching Settings control and fires its change event,
// so there is exactly one place that persists each setting (settings.js).
import { formatDuration, weekdaysFull } from '../lib/utils.js';
import { t } from '../lib/i18n.js';
import { $, $$, settings } from './core.js';

const STEPS = 3;
const GOAL_MINUTES = [0, 30, 60, 120, 180, 240];
let step = 1;

function fill(select, options, value) {
  select.innerHTML = '';
  for (const [v, label] of options) {
    const o = document.createElement('option');
    o.value = String(v);
    o.textContent = label;
    select.appendChild(o);
  }
  select.value = String(value);
}

/** (Re)build the setup controls from the current settings, in the current language. */
function buildSetup() {
  fill($('#wLang'), [...$('#setLanguage').options].map((o) => [o.value, o.textContent]), settings.language);
  const days = weekdaysFull(settings.language);
  fill($('#wWeek'), [[0, days[0]], [1, days[1]]], settings.weekStart);
  const goal = GOAL_MINUTES.includes(settings.dailyGoalMinutes) ? settings.dailyGoalMinutes : 0;
  fill($('#wGoal'), GOAL_MINUTES.map((m) => [m, m ? formatDuration(m * 60) : t('welcome.goalNone')]), goal);
}

function render() {
  for (const el of $$('.welcome-step')) el.classList.toggle('hidden', Number(el.dataset.step) !== step);
  $('#welcomeProgress').textContent = t('welcome.step', { n: step, total: STEPS });
  $('#welcomeSkip').classList.toggle('hidden', step === STEPS);
}

export function showWelcome() {
  step = 1;
  buildSetup();
  render();
  $('#welcomeModal').classList.remove('hidden');
}

/** Drive an existing Settings control so its own handler saves the value. */
function applyThroughSettings(selector, value) {
  const control = $(selector);
  control.value = String(value);
  control.dispatchEvent(new Event('change', { bubbles: true }));
}

export function wireWelcome() {
  const go = (n) => { step = Math.min(STEPS, Math.max(1, n)); render(); $(`.welcome-step[data-step="${step}"] .btn-primary`)?.focus(); };
  $('#welcomeNext1').addEventListener('click', () => go(2));
  $('#welcomeNext2').addEventListener('click', () => go(3));
  $('#welcomeBack2').addEventListener('click', () => go(1));
  $('#welcomeBack3').addEventListener('click', () => go(2));
  $('#welcomeSkip').addEventListener('click', () => $('#welcomeCta').click());

  $('#wLang').addEventListener('change', async (e) => {
    const lang = e.target.value;
    applyThroughSettings('#setLanguage', lang);
    // The language handler saves, then re-localizes the page: wait for it, then rebuild the day names
    // and the "no goal" label in the new language.
    for (let i = 0; i < 40 && settings.language !== lang; i++) await new Promise((r) => setTimeout(r, 50));
    await new Promise((r) => setTimeout(r, 150));
    buildSetup();
    render();
    $('#wLang').focus();
  });
  $('#wWeek').addEventListener('change', (e) => applyThroughSettings('#setWeekStart', e.target.value));
  $('#wGoal').addEventListener('change', (e) => applyThroughSettings('#setDailyGoal', e.target.value));
}
