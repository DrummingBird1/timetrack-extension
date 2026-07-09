# CLAUDE.md

Guidance for Claude / AI assistants and developers working in this repository.

## What this is

**TimeTrack** is a Chrome extension (Manifest V3) that measures how much time the
user actively spends on each website — a privacy-first, local-first alternative
to Webtime Tracker. It adds deep analytics, smart categorization, goals/limits,
cloud backup, and data export.

All data lives **locally** in `chrome.storage.local`. Nothing is sent anywhere
unless the user explicitly enables a backup target. The UI is **Hebrew, RTL**.

## Repository layout

Exactly two top-level folders (plus root docs):

- **`extension/`** — the shippable extension (this is what you load-unpacked and
  zip for the store). Self-contained: `manifest.json`, `background.js`, `icons/`,
  `src/`.
- **`store-assets/`** — everything for the Chrome Web Store: `PRIVACY.md`,
  `STORE_LISTING.md`, `promo/` (promo images), `screenshots/`, and `dev/`
  (the test suite, `package.json`, and `build.ps1`).

Paths below are relative to `extension/`.

## How to run / load it

There is **no build step** — it's plain ES modules, no bundler, no dependencies.

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. **Load unpacked** → select the **`extension/`** folder
4. Pin the extension; click it for the popup, or open the dashboard from the
   popup's "פתח לוח בקרה מלא" button (it's the `options_ui` page).

After editing code: click the **reload** icon on the extension card. For the
service worker, use the "service worker" link on that card to open its DevTools
and see logs. Popup/dashboard each have their own DevTools (right-click → Inspect).

## Architecture (data flow)

```
                 ┌────────────────────────────────────────────┐
 browser events  │           background.js  (SW)              │
 ───────────────▶│  tracking engine: one "current segment"    │
 tabs/windows/   │  commit elapsed → addTime()/addVisit()     │
 idle/alarms     │  state in chrome.storage.session           │
                 └───────────────┬───────────────┬────────────┘
                                 │ messages       │ writes
                  getLive/flush/ │                ▼
                  setEnabled/    │        chrome.storage.local
                  runBackup/...  │        ttt_day_<YYYY-MM-DD>, ttt_index,
                                 │        ttt_settings, ttt_meta
        ┌────────────────────────┴───────────┐
        ▼                                     ▼
   popup/ (quick view)              dashboard/ (full analytics + settings)
   read storage + getLive           read storage, render charts, edit settings
```

The **background service worker is the only writer of tracking data.** Popup and
dashboard read `chrome.storage.local` directly for rendering and send messages to
the worker for actions (toggle tracking, flush, run backup, prune).

### The tracking engine (`background.js`)

- Keeps a single **current segment**: `{ domain, since, counting, lastDomain,
  focused, idle, audible }`, persisted in `chrome.storage.session` so it survives
  service-worker restarts.
- On every relevant event it calls `refresh()`, which: (1) commits the elapsed
  time of the open segment via `addTime`, (2) re-queries the active tab and
  decides whether to count, (3) starts a fresh segment, (4) checks limits.
- **Counting rule** (`shouldCount`): `enabled` AND a valid domain AND not
  blacklisted AND (window focused & not idle) — OR the tab is audible and
  `countAudibleBackground` is on.
- A 1-minute `ttt_tick` alarm commits time periodically so long sessions aren't
  lost if no events fire. A 60-minute `ttt_backup` alarm runs auto-backup when due.
- Overlapping events are serialized through a tiny promise-chain mutex (`locked`)
  so a segment is never double-committed.

## Data model

One record **per day**, keyed `ttt_day_<YYYY-MM-DD>` (local date, no UTC drift):

```js
{
  domains: { "youtube.com": { t: 3600, v: 5, dh: { "20": 3600 } }, ... },
  // t = seconds, v = visits, dh = sparse per-domain hourly map (schema v2)
  hours:   [/* 24 numbers */]                           // seconds per hour-of-day
}
```

Supporting keys in `chrome.storage.local`:

- `ttt_index` — sorted array of day-keys that exist (avoids scanning all storage).
- `ttt_settings` — see `DEFAULT_SETTINGS` in `src/lib/storage.js`.
- `ttt_meta` — `{ version, firstDay, installedAt }`.

Why per-day records: each tracking commit rewrites only one small object instead
of one giant blob, which keeps writes cheap as history grows.

**Domains** are bucketed by registrable domain when `groupSubdomains` is on
(`mail.google.com` → `google.com`), using a small built-in public-suffix list in
`utils.js` (`MULTI_TLDS`). It is a heuristic, not the full PSL.

## File map

| File | Responsibility |
|------|----------------|
| `manifest.json` | MV3 manifest. Permissions: storage, tabs, idle, alarms, notifications, unlimitedStorage. |
| `background.js` | Service worker = tracking engine + message router + alarms. |
| `src/lib/utils.js` | Pure helpers: dates/day-keys, domain extraction, duration formatting, favicons. No chrome/DOM. |
| `src/lib/storage.js` | All `chrome.storage.local` access: settings, per-day read/write, index, prune, export/import. |
| `src/lib/categories.js` | Category definitions + default domain→category map + `categorize()`. |
| `src/lib/stats.js` | **Pure** analytics over day records (aggregation, categories, focus score, heatmap, streaks, trends). |
| `src/lib/charts.js` | Dependency-free SVG charts (bar, donut, heatmap, sparkline). CSP-safe. |
| `src/lib/backup.js` | Cloud backup: chunked `storage.sync`, custom REST endpoint, `runAutoBackup`. |
| `src/lib/crypto.js` | Optional AES-256-GCM backup encryption (PBKDF2 key from passphrase). |
| `src/lib/i18n.js` | Runtime he/en dictionary + `t()` + `localize()` (live language switch). |
| `src/popup/*` | Toolbar popup: today total, live counter, top sites, 7-day mini chart, tracking toggle, focus session. |
| `src/dashboard/*` | Options page: Overview / Sites / Insights / Settings tabs. |
| `src/blocked/*` | Focus-mode block page shown when a blocked site is opened during a session. |
| `store-assets/dev/tests/*` | Node `node:test` unit + integration tests. `npm test` (run from `store-assets/dev`). |
| `store-assets/dev/package.json` | Dev-only (test script + `"type":"module"`); the extension has no deps/build. |
| `store-assets/dev/build.ps1` | Builds `timetrack-v<version>.zip` from `extension/` (store upload). |
| `store-assets/PRIVACY.md` / `STORE_LISTING.md` | Privacy policy + Chrome Web Store submission pack. |
| `icons/*` | Generated gradient clock icons (16/32/48/128). |

## Conventions & constraints

- **No external dependencies, no build step.** Everything is native ES modules
  loaded via `<script type="module">` and the SW's `"type": "module"`. Keep it
  that way unless there's a strong reason; charts are hand-rolled SVG precisely to
  avoid a Chart.js-style dependency and CSP headaches.
- **CSP:** extension pages forbid inline scripts. No inline `onclick`, no `eval`.
  Inline `style="..."` attributes are fine and used for data-driven styling.
- **Pure vs. effectful split:** `utils.js` and `stats.js` must stay free of
  `chrome.*` and DOM so they're trivially testable and reusable. Storage access
  goes through `storage.js`; only `background.js` *writes* tracking data.
- **Theming:** all colors are CSS variables; charts read them via
  `getComputedStyle`. Light/dark/auto handled by `data-theme` on `<html>`.
- **i18n:** UI text lives in `i18n.js` (he + en). In HTML use `data-i18n` /
  `data-i18n-ph` / `data-i18n-title` and call `localize()`; in JS use `t(key,
  vars)`. Adding a string means adding the key to **both** language blocks.
  `setLang()` also flips `formatDuration` units and `dir`. Default is Hebrew, RTL.
  Durations format via `formatDuration`/`formatClock`; dates via `locale()`.
- **Time math:** all day-keys are **local** dates. Use `dayKey()` / `parseDayKey()`,
  never hand-roll date strings (UTC drift bugs).

## Settings shape

See `DEFAULT_SETTINGS` in `src/lib/storage.js`. Notable fields: `idleSeconds`
(min 15 — Chrome's `idle.setDetectionInterval` floor), `groupSubdomains`,
`retentionDays`, `dailyLimitMinutes` / `siteLimits` (notifications),
`categoryMap` (user overrides), `blacklist`, and the `backup` sub-object
(`syncEnabled`, `endpointUrl`, `endpointToken`, `autoIntervalHours`, `lastBackup`,
`lastBackupStatus`). When settings change from the dashboard, it sends
`settingsChanged` so the worker re-applies the idle interval and refreshes.

## Cloud backup

Two zero-infra targets plus manual file I/O:

1. **`chrome.storage.sync`** (`backupToSync`/`restoreFromSync`): serializes the
   full snapshot, splits it into ≤7 KB chunks (`ttt_sync_<n>` + `ttt_sync_meta`)
   to respect the ~8 KB/item, ~100 KB/total sync quota. If history exceeds the
   quota, **oldest days are trimmed** from the sync copy (local data is untouched).
2. **Custom REST endpoint** (`backupToEndpoint`): `POST` the snapshot to an
   **HTTPS-only** URL (enforced) with an optional `Authorization: Bearer <token>`.
3. **File export/import** (`exportAll`/`importAll` in `storage.js`, wired in the
   dashboard): JSON (full, re-importable) and CSV (full or current-view rows).
   Import modes: `merge` (keeps the larger time/visits per domain/day — safe to
   re-import) or `replace` (wipe first). Import auto-detects encrypted envelopes.

**Encryption (`crypto.js`):** when `backup.encrypt` + `backup.passphrase` are set,
the snapshot is AES-256-GCM encrypted (PBKDF2-SHA256 key) before it leaves the
device, for both sync and endpoint targets — the server/sync see only ciphertext.
`isEncrypted()`/`decryptJSON()` handle restore; `restoreFromSync` throws
`{code:'ENCRYPTED'}` when a passphrase is needed so the UI can prompt. File export
stays plaintext by design (a local file the user already controls).

## Focus mode (Pomodoro + blocking)

Runtime session lives in `storage.session` (`ttt_focus`), snapshotted at start so
editing settings mid-session doesn't change it. It runs a **Pomodoro state
machine** (`checkFocusExpiry`): `work → break → work … → done` across `totalCycles`
(fields `phase`, `cycle`, `workMs`, `breakMs`). Blocking is enforced only during
`work` phases via `blockingLive()`. Two modes (`mode`): **block** (block the
chosen categories/domains) or **allow** (block everything *except* the allowed
ones). While a work phase is live, `chrome.tabs.onUpdated` (and `enforceAllTabs`
at start / on each work resume) redirect any blocked tab to `src/blocked/blocked.html`
(a web-accessible resource, `use_dynamic_url`). The popup starts/stops sessions via
`startFocus`/`stopFocus`/`getFocus`; `chrome.commands` also toggles focus/tracking.
No host permissions — redirection uses the existing `tabs` API.

## Migrations & weekly summary

- **Migrations:** `storage.migrate()` runs on `init()`, applying any registered
  `MIGRATIONS` whose target exceeds the stored `meta.version`, then stamps
  `meta.version = SCHEMA_VERSION`. Append future data transforms there.
- **Weekly summary:** the hourly backup alarm also calls `maybeWeeklySummary()`,
  which fires one digest notification on the configured `weekStart` weekday
  (deduped via `meta.lastWeeklySummary`).

> **Google Drive note:** a true Drive backup needs an OAuth2 client_id configured
> in Google Cloud Console and added to the manifest (`oauth2` + `identity`
> permission). It's intentionally **not** wired up here to keep the extension
> install-and-go. The custom-endpoint option covers self-hosted cloud backup
> without per-user OAuth setup. If asked to add Drive, extend `backup.js` with a
> `backupToDrive()` using `chrome.identity.getAuthToken` and the Drive `files`
> API, and surface it next to the other targets in the Settings panel.

## Analytics features (where they live)

- **Focus score** (`stats.focusScore`): weights each category's time by its
  `score` (+1 productive / 0 neutral / −1 distracting) → 0–100.
- **Heatmap** (`stats.weekHourHeatmap` + `charts.heatmap`): weekday × hour-of-day.
- **Trends** (`stats.trend`): current vs. previous equal-length period (% change).
- **Insights** (`stats.generateInsights`): plain-language this-week-vs-last-week
  observations; returns raw `{key, vars}` that the UI localizes (cat/weekday).
- **Per-site peak hour** (`stats.domainPeakHour`): from the per-domain `dh` map.
- **Categories** (`categories.js`): defaults + user overrides via the Settings
  category editor; everything else falls back to `other`.

## Common gotchas

- The service worker is **ephemeral**. Don't keep important state only in module
  variables — persist to `storage.session` (hot state) or `storage.local` (data).
  The `state` variable is a cache that's reloaded from `storage.session`.
- `idle.setDetectionInterval` minimum is **15 s**; `idleSeconds` is clamped to it.
- Reading `tab.url` requires the `tabs` permission (we have it) — no host
  permissions are requested, by design.
- Charts need a visible (non-`display:none`) container to measure `clientWidth`;
  that's why tab panels are rendered **after** being made active. If you add a
  chart, render it from `renderCurrentTab()` for the active tab, and re-render on
  resize/theme change via `rerenderCharts()`.
- **Site icons are generated locally** (`utils.favicon` → a `data:` SVG letter
  avatar). This is deliberate: a remote favicon service would leak every visited
  domain off-device, breaking the privacy promise. If you ever want real brand
  icons without that leak, use Chrome's local `_favicon/` API (needs the
  `favicon` permission) — never a third-party URL.
- **Segment-cap invariant:** the worker cold-starts on most ticks, so `init()`
  must NOT reset `state.since` — the open segment's elapsed time is credited by
  the next `refresh()`. Each commit is capped at `MAX_SEGMENT_SECONDS` (120 s) so
  a long dormancy (sleep/closed browser) can't be counted as active time. The
  1-minute tick keeps segments short, so the cap never bites in normal use.

## Tests

From `store-assets/dev/`, `npm test` (or `node --test`) runs the suite (48 cases):

- **Unit** (`utils.test.js`, `stats.test.js`) — the pure modules, imported directly
  (includes `generateInsights` and `domainPeakHour`).
- **Integration** (`backup.integration.test.js`, `tracking.integration.test.js`,
  `focus.integration.test.js`) — exercise the real `storage.js`/`backup.js`/
  `crypto.js` and the `background.js` tracking + focus engines against an in-memory
  **mock of the chrome.* APIs**. The sync mock enforces Google's real quotas
  (8 KB/item, 100 KB total); the tracking/focus mocks drive tabs/idle events and
  the Pomodoro state machine with a controllable clock. These caught a real
  sync-quota bug, so keep them green when touching backup, tracking, or focus.

What tests can't cover here: DOM rendering (popup/dashboard), chart output, and
the focus-mode tab redirect — those need the extension loaded in a real browser.

## Ideas / not-yet-done

- Google Drive OAuth backup (see note above).
- Translating the built-in default category map / public-suffix list beyond he/en.
- Per-site **hourly** timeline (day records only store day-level hours, so the
  drill-down shows a per-day timeline + busiest day, not per-site peak hour).
- Weekly email summary (only an in-browser notification exists today).
