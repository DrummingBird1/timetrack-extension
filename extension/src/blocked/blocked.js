import { getSettings } from '../lib/storage.js';
import { setLang, getLang, t, dir } from '../lib/i18n.js';
import { formatClock } from '../lib/utils.js';
import { sendMessage as msg } from '../lib/messages.js';

const $ = (id) => document.getElementById(id);
const SNOOZE_MINUTES = 10;
let timer = null;


function localizeStatic() {
  $('title').textContent = t('blocked.title');
  $('msg').textContent = t('blocked.msg');
  $('timerLabel').textContent = t('blocked.remaining');
  $('backBtn').textContent = t('blocked.back');
  $('endBtn').textContent = t('blocked.end');
}

function siteUrl() {
  const d = new URLSearchParams(location.search).get('d');
  return d ? `https://${d}` : 'about:blank';
}

function tick(endsAt) {
  const remaining = Math.max(0, (endsAt - Date.now()) / 1000);
  $('timer').textContent = formatClock(remaining);
  if (remaining <= 0) {
    clearInterval(timer);
    // Work phase ended → a break begins (or the session is over): release to the
    // site. If the next work cycle starts, the worker re-blocks the tab.
    location.replace(siteUrl());
  }
}

async function main() {
  const settings = await getSettings();
  await setLang(settings.language || 'he');
  document.documentElement.lang = getLang();
  document.documentElement.dir = dir();
  localizeStatic();

  $('domain').textContent = new URLSearchParams(location.search).get('d') || '';

  const focus = await msg('getFocus');
  // Only hold the user here during an active WORK phase. On break / ended, let them through.
  if (focus && focus.active && focus.phase === 'work' && focus.endsAt) {
    tick(focus.endsAt);
    timer = setInterval(() => tick(focus.endsAt), 500);
  } else {
    location.replace(siteUrl());
    return;
  }

  // Strict mode removes the escape hatches; otherwise the user may pause blocking for a while.
  const strict = !!focus.strict;
  $('endBtn').hidden = strict;
  $('snoozeBtn').hidden = strict;
  $('strictNote').hidden = !strict;
  $('strictNote').textContent = t('blocked.strict');
  $('snoozeBtn').textContent = t('blocked.snooze', { m: SNOOZE_MINUTES });
  $('snoozeBtn').addEventListener('click', async () => {
    await msg('snoozeFocus', { minutes: SNOOZE_MINUTES });
    location.replace(siteUrl());
  });
  $('endBtn').addEventListener('click', async () => {
    await msg('stopFocus');
    location.replace(siteUrl());
  });
  // "Back" goes to a blank tab rather than history.back(), which would bounce
  // straight back onto the blocked site and re-trigger the block.
  $('backBtn').addEventListener('click', () => location.replace('about:blank'));
}

main();
