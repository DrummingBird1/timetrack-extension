# Browser support

| Browser | Status | Effort |
|---------|--------|--------|
| **Chrome** (≥ 111) | ✅ Supported and tested (unit, integration and Puppeteer E2E against Chrome for Testing) | — |
| **Microsoft Edge** | 🟡 Expected to work unchanged — **not tested** | Submit the same zip to Edge Add-ons |
| **Firefox** | 🔴 Needs a port — **not attempted** | A small manifest variant + two feature fallbacks |
| Safari | ⚪ Out of scope (needs an Xcode wrapper app and an Apple developer account) | — |

Only Chrome is verified. Everything below for other browsers is reasoned from the
manifest and the `chrome.*` APIs the extension uses, **not from running it there** —
treat it as a plan, and test before promising anything.

## Edge

Edge is Chromium, runs Manifest V3 and implements every API TimeTrack uses
(`storage`, `tabs`, `idle`, `alarms`, `notifications`, `commands`). The Chrome zip
should install as-is (`edge://extensions` → Developer mode → Load unpacked).

To publish: Microsoft Partner Center → Edge Add-ons (free, no registration fee),
upload `dist/timetrack-v<version>.zip`, reuse the store text and screenshots from
[`STORE_LISTING.md`](STORE_LISTING.md).

Things to check on a real Edge before submitting:

- **Cloud backup** uses `chrome.storage.sync`; in Edge this syncs through the Microsoft
  account and is quota-limited in the same way, but verify the 8 KB/item and ~100 KB
  limits actually match (the chunking is sized for Chrome's).
- **Real site icons** (optional `favicon` permission and the `_favicon/` URL) is a Chrome
  feature; confirm it, or hide the toggle, in Edge.
- The `commands` default shortcuts (`Alt+Shift+T/F/D`) may collide with Edge's own.

The E2E harness could target Edge by pointing Puppeteer's `executablePath` at it, but
extension loading flags differ between builds; not done.

## Firefox

Firefox runs MV3 but differs from Chrome in ways that affect this extension:

1. **No `background.service_worker`.** Firefox uses event pages:
   `"background": { "scripts": ["background.js"], "type": "module" }`
   (supported since Firefox 112). A second manifest, or a build step that rewrites one
   key, is needed. The repo is deliberately build-free, so the cleanest option is a
   tiny script that emits `manifest.firefox.json` and zips with it — not written.
2. **`browser_specific_settings.gecko.id`** is required for the extension to be
   installable and for `storage.sync` to work (an add-on ID such as `timetrack@…`).
3. **Notification buttons** (`chrome.notifications` with `buttons`, used for the limit
   "snooze" action) are not supported — the snooze action would need another entry
   point, e.g. opening the popup from the notification click.
4. **`web_accessible_resources` → `use_dynamic_url`** is Chrome-only; Firefox ignores or
   warns about it. The block page would be reachable at a stable URL (a small
   fingerprinting trade-off).
5. **`favicon` permission / `_favicon/`** don't exist; the letter-avatar icons (already
   the default) still work, and the "Real site icons" toggle must be hidden.
6. **`minimum_chrome_version`** is ignored (harmless).
7. The service worker's *ephemeral* assumptions (state kept in `storage.session`, the
   1-minute `alarms` tick) fit event pages too, but the cold-start timing differs and
   must be re-tested — in particular the segment-cap invariant in `CLAUDE.md`.

Estimate: a day or two for the manifest variant, the two fallbacks and a Firefox pass
over the E2E suite (Puppeteer supports Firefox via WebDriver BiDi, but extension
installation there goes through `browser.installAddon`, so the harness needs a
Firefox-specific launch path). Publishing on addons.mozilla.org is free.

## Recommendation

Ship Chrome first, then Edge (same zip, different store, little risk). Firefox is worth
doing only if there is demand — it adds a second manifest to maintain.
