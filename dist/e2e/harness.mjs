// Real-browser harness: launches Chrome for Testing with the unpacked extension
// loaded, so tests drive the actual popup / dashboard / service worker instead of
// a hand-written chrome.* mock. Run with `pnpm test:e2e`.

import puppeteer from 'puppeteer';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const EXT_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../extension');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export { sleep };

/** Poll until `fn()` returns truthy (or throw after `timeout` ms). */
export async function waitFor(fn, { timeout = 8000, interval = 50, message = 'condition' } = {}) {
  const start = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - start > timeout) throw new Error(`timed out waiting for ${message}`);
    await sleep(interval);
  }
}

export async function launch() {
  const browser = await puppeteer.launch({
    headless: true,
    pipe: true,
    enableExtensions: [EXT_PATH],
    args: ['--no-sandbox', '--no-first-run', '--window-size=1400,900'],
  });

  const swTarget = await browser.waitForTarget(
    (t) => t.type() === 'service_worker' && t.url().endsWith('/background.js'),
    { timeout: 20000 },
  );
  const id = new URL(swTarget.url()).host;
  const base = `chrome-extension://${id}/`;
  const errors = [];

  /** Open an extension page and record every uncaught error / console.error on it. */
  async function openPage(rel, { viewport = { width: 1400, height: 900 } } = {}) {
    const page = await browser.newPage();
    await page.setViewport(viewport);
    page.on('pageerror', (e) => errors.push(`[${rel}] pageerror: ${e.message}`));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(`[${rel}] console.error: ${m.text()}`);
    });
    page.on('dialog', async (d) => { ext.dialogs.push({ type: d.type(), message: d.message() }); await d.accept(ext.promptAnswer); });
    await page.goto(base + rel, { waitUntil: 'load' });
    return page;
  }

  // A throwaway extension-origin page used to run code with chrome.* access.
  const ops = await openPage('src/popup/popup.html');

  const ext = {
    browser, id, base, errors, openPage, ops,
    dialogs: [],        // every alert/confirm/prompt the extension raised
    promptAnswer: '',   // text returned to prompt() dialogs

    /** Run `fn(...args)` inside an extension page (has the chrome.* APIs). */
    run: (fn, ...args) => ops.evaluate(fn, ...args),

    /** Import a snapshot through the extension's own storage.js. */
    async seed(snapshot, mode = 'replace') {
      return ops.evaluate(async (url, snap, m) => {
        const s = await import(url);
        return s.importAll(snap, { mode: m, includeSettings: false });
      }, `${base}src/lib/storage.js`, snapshot, mode);
    },

    async getSettings() {
      return ops.evaluate(async (url) => (await import(url)).getSettings(), `${base}src/lib/storage.js`);
    },
    async saveSettings(patch) {
      return ops.evaluate(async (url, p) => (await import(url)).saveSettings(p), `${base}src/lib/storage.js`, patch);
    },

    /** Wipe all extension storage so each test starts from a clean slate. */
    async reset() {
      await ops.evaluate(async () => {
        await chrome.storage.local.clear();
        await chrome.storage.sync.clear();
        await chrome.storage.session.clear();
      });
      errors.length = 0;
      ext.dialogs.length = 0;
      ext.promptAnswer = '';
    },

    /** Ask the service worker something (same path popup/dashboard use). */
    message: (type, extra = {}) => ops.evaluate((m) => chrome.runtime.sendMessage(m), { type, ...extra }),

    async close() { await browser.close(); },
  };

  // The extension opens a welcome tab on first install; it is noise for tests.
  for (const p of await browser.pages()) {
    if (p.url().includes('#welcome')) await p.close();
  }
  return ext;
}

/** Tiny local web server so tests can navigate to a real http://localhost:PORT page. */
export function startServer() {
  const server = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.end('<!doctype html><title>test page</title><h1>test page</h1>');
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({
        port: server.address().port,
        close: () => new Promise((r) => { server.close(r); server.closeAllConnections(); }),
      });
    });
  });
}
