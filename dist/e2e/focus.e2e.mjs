// Popup, focus mode (including the real tab redirect that unit tests can't cover)
// and a live-tracking smoke test.

import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { launch, startServer, waitFor, sleep } from './harness.mjs';

let ext;
let server;
before(async () => { ext = await launch(); server = await startServer(); });
after(async () => { await ext?.close(); await server?.close(); });
beforeEach(async () => { await ext.reset(); });

const hostUrl = () => `http://localhost:${server.port}/`;

test('popup: a focus session can be started and ended', async () => {
  const popup = await ext.openPage('src/popup/popup.html');
  await popup.waitForSelector('#startFocus');
  await popup.$eval('#focusMin', (e) => { e.value = '5'; });
  await popup.click('#startFocus');
  await popup.waitForSelector('#focusActive:not(.hidden)');
  await waitFor(async () => /^0[45]:\d\d$/.test(await popup.$eval('#focusTimer', (e) => e.textContent.trim())), { message: 'countdown ~5 minutes' });
  assert.equal((await ext.message('getFocus')).active, true);
  await popup.click('#endFocus');
  await popup.waitForSelector('#focusIdle:not(.hidden)');
  assert.equal((await ext.message('getFocus')).active, false);
  assert.deepEqual(ext.errors, []);
  await popup.close();
});

test('service worker: notifications work in a non-default language (dictionary fetched inside the worker)', async () => {
  for (const language of ['ar', 'ru']) {
    await ext.saveSettings({ language });
    const view = await ext.message('startFocus', { minutes: 5 });   // notify(t(...)) runs inside the worker
    assert.equal(view.error, undefined, `startFocus failed for ${language}: ${view.error}`);
    assert.equal(view.active, true);
    await ext.message('stopFocus');
  }
  assert.deepEqual(ext.errors, []);
});

test('popup: the tracking switch pauses and resumes tracking', async () => {
  const popup = await ext.openPage('src/popup/popup.html');
  await popup.waitForSelector('#enabledToggle');
  await popup.$eval('#enabledToggle', (e) => e.closest('label').click());
  await waitFor(async () => (await ext.getSettings()).enabled === false, { message: 'tracking disabled' });
  assert.equal((await ext.message('getLive')).enabled, false);
  await popup.$eval('#enabledToggle', (e) => e.closest('label').click());
  await waitFor(async () => (await ext.getSettings()).enabled === true, { message: 'tracking re-enabled' });
  await popup.close();
});

test('focus mode (block list): a blocked domain is redirected to the block page, and can be released', async () => {
  await ext.saveSettings({ focus: { mode: 'block', blockDomains: ['localhost'] } });
  await ext.message('startFocus', { minutes: 5 });
  const tab = await ext.browser.newPage();
  await tab.goto(hostUrl(), { waitUntil: 'load' }).catch(() => {});
  await waitFor(() => tab.url().startsWith(`${ext.base}src/blocked/blocked.html`), { message: 'redirect to block page' });
  assert.ok(tab.url().includes('d=localhost'));
  await tab.waitForSelector('#domain');
  assert.equal(await tab.$eval('#domain', (e) => e.textContent), 'localhost');
  await waitFor(async () => /^0[45]:\d\d$/.test(await tab.$eval('#timer', (e) => e.textContent.trim())), { message: 'block-page countdown' });

  await tab.click('#endBtn');
  await waitFor(async () => (await ext.message('getFocus')).active === false, { message: 'session ended from the block page' });
  await tab.close();
});

test('focus mode (allow list): only allowed domains get through', async () => {
  await ext.saveSettings({ focus: { mode: 'allow', allowCategories: [], allowDomains: [] } });
  await ext.message('startFocus', { minutes: 5 });
  const blocked = await ext.browser.newPage();
  await blocked.goto(hostUrl(), { waitUntil: 'load' }).catch(() => {});
  await waitFor(() => blocked.url().startsWith(`${ext.base}src/blocked/blocked.html`), { message: 'not-allowed domain to be blocked' });
  await blocked.close();

  await ext.message('stopFocus');
  await ext.saveSettings({ focus: { allowDomains: ['localhost'] } });
  await ext.message('startFocus', { minutes: 5 });
  const allowed = await ext.browser.newPage();
  await allowed.goto(hostUrl(), { waitUntil: 'load' });
  await sleep(700);
  assert.equal(allowed.url(), hostUrl(), 'an allow-listed domain is not redirected');
  await allowed.close();
});

test('focus mode: no blocking happens when no session is running', async () => {
  await ext.saveSettings({ focus: { mode: 'block', blockDomains: ['localhost'] } });
  const tab = await ext.browser.newPage();
  await tab.goto(hostUrl(), { waitUntil: 'load' });
  await sleep(700);
  assert.equal(tab.url(), hostUrl());
  await tab.close();
});

test('tracking: the active tab domain is detected, and time is credited while the user is active', async (t) => {
  // A hostname no earlier test used: the service worker keeps its "last domain" in memory across tests.
  const domain = 'e2e-tracking.localhost';           // Chrome resolves *.localhost to loopback
  const tab = await ext.browser.newPage();
  await tab.goto(`http://${domain}:${server.port}/`, { waitUntil: 'load' });
  await tab.bringToFront();
  await ext.message('flush');
  assert.equal((await ext.message('getLive')).currentDomain, domain, 'the real active tab resolves to its domain');

  // Crediting time needs chrome.idle to report "active". A locked screen / non-interactive
  // session (common on CI and on a locked desktop) legitimately reports "locked" — the
  // engine must NOT count then, and tracking.integration.test.js covers crediting with a
  // controllable idle state — so only assert the credit when the browser says "active".
  const idle = await ext.run(() => chrome.idle.queryState(15));
  if (idle !== 'active') {
    t.diagnostic(`chrome.idle reports "${idle}" here — verified detection only, skipped the crediting assertion`);
    assert.equal((await ext.message('getLive')).counting, false, 'must not count while the session is locked/idle');
    await tab.close();
    return;
  }
  await sleep(2600);
  await ext.message('flush');
  const found = await ext.run(async (url, d) => {
    const s = await import(url);
    const days = await s.getDays(await s.getIndex());
    let secs = 0;
    let visits = 0;
    for (const day of Object.values(days)) { secs += day.domains[d]?.t || 0; visits += day.domains[d]?.v || 0; }
    return { secs, visits };
  }, `${ext.base}src/lib/storage.js`, domain);
  assert.ok(found.secs >= 1, `${domain} recorded ${found.secs}s`);
  assert.ok(found.visits >= 1, `${domain} recorded ${found.visits} visits`);
  await tab.close();
});

test('block page: "allow 10 minutes" pauses blocking; strict mode removes every escape hatch', async () => {
  const blockedBase = `${ext.base}src/blocked/blocked.html`;
  await ext.saveSettings({ focus: { mode: 'block', blockDomains: ['localhost'], strict: false } });
  await ext.message('startFocus', { minutes: 5 });
  const tab = await ext.browser.newPage();
  await tab.goto(hostUrl(), { waitUntil: 'load' }).catch(() => {});
  await waitFor(() => tab.url().startsWith(blockedBase), { message: 'redirect to block page' });
  await tab.waitForSelector('#snoozeBtn');
  assert.equal(await tab.$eval('#snoozeBtn', (e) => e.hidden), false);
  assert.equal(await tab.$eval('#endBtn', (e) => e.hidden), false);
  assert.equal(await tab.$eval('#strictNote', (e) => e.hidden), true);

  await tab.click('#snoozeBtn');
  await waitFor(async () => (await ext.message('getFocus')).pausedUntil > Date.now(), { message: 'blocking paused' });
  const other = await ext.browser.newPage();
  await other.goto(hostUrl(), { waitUntil: 'load' });
  await sleep(700);
  assert.equal(other.url(), hostUrl(), 'not redirected while paused');
  await other.close();
  await tab.close();
  await ext.message('stopFocus');

  // strict mode
  await ext.saveSettings({ focus: { strict: true } });
  await ext.message('startFocus', { minutes: 5 });
  const strictTab = await ext.browser.newPage();
  await strictTab.goto(hostUrl(), { waitUntil: 'load' }).catch(() => {});
  await waitFor(() => strictTab.url().startsWith(blockedBase), { message: 'redirect to block page (strict)' });
  await strictTab.waitForSelector('#strictNote:not([hidden])');
  assert.equal(await strictTab.$eval('#endBtn', (e) => e.hidden), true);
  assert.equal(await strictTab.$eval('#snoozeBtn', (e) => e.hidden), true);
  assert.equal((await ext.message('stopFocus')).refused, true, 'the worker refuses to stop a strict work phase');
  assert.equal((await ext.message('snoozeFocus', { minutes: 10 })).refused, true);

  const popup = await ext.openPage('src/popup/popup.html');
  await popup.waitForSelector('#focusActive:not(.hidden)');
  assert.ok(await popup.$eval('#endFocus', (e) => e.classList.contains('hidden')), 'no end button in the popup either');
  await popup.close();
  await strictTab.close();
});
