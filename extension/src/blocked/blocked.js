import { getSettings, K } from '../lib/storage.js';
import { setLang, getLang, t, dir } from '../lib/i18n.js';
import { formatClock, cleanDomain, hostnameFromUrl } from '../lib/utils.js';
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

// What the worker recorded for this tab when it redirected it here: the blocked site (d) and the page (u).
// It is read from storage.session, never from the address bar, so nothing a link can put in this page's URL
// decides where the tab goes. Missing (a restored tab after a browser restart, a page opened by hand) means
// there is nowhere to send the tab back to.
let target = null;

async function loadTarget() {
  try {
    const tab = await chrome.tabs.getCurrent();
    if (!tab || tab.id == null) return null;
    const key = K.blocked(tab.id);
    const got = await chrome.storage.session.get(key);
    return got[key] || null;
  } catch {
    return null;
  }
}

// Where to let the user through to: the page that was blocked when it really belongs to the recorded site
// and is http(s), otherwise the site's front page.
function siteUrl() {
  const d = target && cleanDomain(target.d);
  if (!d) return 'about:blank';
  const u = typeof target.u === 'string' ? target.u : '';
  const host = u ? hostnameFromUrl(u) : null;
  if (u && host && (host === d || host.endsWith(`.${d}`))) return u;
  return `https://${d}`;
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
  if (settings.theme === 'light' || settings.theme === 'dark') document.documentElement.dataset.theme = settings.theme;
  localizeStatic();

  target = await loadTarget();
  $('domain').textContent = target ? cleanDomain(target.d) : '';

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
