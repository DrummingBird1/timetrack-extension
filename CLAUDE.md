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

Four top-level folders (plus root docs):

- **`extension/`** — the shippable extension (this is what you load-unpacked and
  zip for the store). Self-contained: `manifest.json`, `background.js`, `icons/`,
  `src/`.
- **`store-assets/`** — everything for the Chrome Web Store listing itself:
  `PRIVACY.md`, `STORE_LISTING.md`, `promo/` (promo graphics), `screenshots/`,
  and `site/` (the marketing website source, deployed to the `gh-pages` branch
  — see below).
- **`dist/`** — dev tooling and build output: the test suite (`tests/`),
  `package.json`, `build.ps1`, and the zip(s) it produces
  (`timetrack-v<version>.zip`, gitignored). Despite the name, nothing here ships
  inside the extension — `build.ps1` zips `extension/`'s contents only.
- **`archive/`** — superseded assets kept for reference (old screenshots/promo
  images, old build zips). Not part of the current release; see `archive/README.md`.

Paths below are relative to `extension/`.

## Marketing site (GitHub Pages)

`store-assets/site/index.html` is the source of truth for the public site at
`https://drummingbird1.github.io/timetrack-extension/` — a single self-contained
file (inline CSS/SVG/JS, no external requests, no build step), matching the
extension's own no-dependency ethos. It has a tiny two-language (en/he) runtime
toggle (a `STR` dict + `data-t` attributes, `localStorage`-persisted) — this is
deliberately a separate, much smaller pattern from `extension/src/lib/i18n.js`
(the site isn't part of the shippable extension bundle, and only needs the two
languages the maintainer writes copy in). The privacy-policy section's content
mirrors `store-assets/PRIVACY.md`; keep them in sync when the policy changes.
**Deploying it is a manual step** — copy `store-assets/site/*` (including
`.nojekyll`) to the `gh-pages` branch root and push; this does not happen
automatically on a release.

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
| `src/lib/i18n.js` | Runtime six-language dictionary (he/en/ar/ru/es/fr) + `t()` + `localize()` (live language switch). |
| `src/popup/*` | Toolbar popup: today total, live counter, top sites, 7-day mini chart, tracking toggle, focus session. |
| `src/dashboard/*` | Options page: Overview / Sites / Insights / Settings tabs. |
| `src/blocked/*` | Focus-mode block page shown when a blocked site is opened during a session. |
| `dist/tests/*` | Node `node:test` unit + integration tests. `npm test` (run from `dist`). |
| `dist/package.json` | Dev-only (test script + `"type":"module"`); the extension has no deps/build. |
| `dist/build.ps1` | Builds `timetrack-v<version>.zip` from `extension/` (store upload). |
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
- **i18n:** UI text lives in `i18n.js` — six languages: `he` (default, RTL),
  `en`, `ar` (RTL), `ru`, `es`, `fr`. In HTML use `data-i18n` / `data-i18n-ph` /
  `data-i18n-title` and call `localize()`; in JS use `t(key, vars)`. Adding a
  string means adding the key to **all six** language blocks — `i18n.test.js`
  enforces this (fails the build if any language's key set or `{placeholder}`
  tokens drift from `he`, the source language). Direction/locale come from the
  `LANG_META` lookup (`dir()`/`locale()`) — extend that table, don't hardcode a
  he-or-not binary anywhere; the same applies to `utils.js`'s
  `weekdaysShort()`/`weekdaysFull()`/`DURATION_UNITS`, which use the same
  per-language lookup pattern. `setLang()` also flips `formatDuration` units.
  When setting `document.documentElement.lang` from settings, use
  `i18n.getLang()` (the normalized/fallback-applied value), not
  `settings.language` directly — three UI entry points do this correctly now
  (`dashboard.js`, `popup.js`, `blocked.js`); don't reintroduce a raw binary
  check when adding a fourth. Durations format via `formatDuration`/
  `formatClock`; dates via `locale()`.
- **Time math:** all day-keys are **local** dates. Use `dayKey()` / `parseDayKey()`,
  never hand-roll date strings (UTC drift bugs).

## Settings shape

See `DEFAULT_SETTINGS` in `src/lib/storage.js`. Notable fields: `idleSeconds`
(min 15 — Chrome's `idle.setDetectionInterval` floor), `groupSubdomains`,
`retentionDays`, `dailyLimitMinutes` / `siteLimits` (notifications),
`categoryMap` (user overrides), `blacklist` (never-tracked domains, edited from
the Settings "untracked sites" panel and the per-site drill-down), `pinnedSites`
(domains pinned to the top of the Sites table), the `focus` sub-object
(work/break/`longBreakMinutes`+`longBreakEvery`, `mode`, and the
`blockCategories`/`blockDomains`/`allowCategories`/`allowDomains` lists — all
editable in the focus panel), and the `backup` sub-object (`syncEnabled`,
`endpointUrl`, `endpointToken`, `autoIntervalHours`, `lastBackup`,
`lastBackupStatus`). When settings change from the dashboard, it sends
`settingsChanged` so the worker re-applies the idle interval and refreshes.

`categoryMap` and `siteLimits` are **plain objects**, not arrays — deleting a
key from one requires `storage.saveSettingsKey(key, value)`, not
`saveSettings({key: value})`. `deepMerge` (the engine behind `saveSettings`)
only ever *adds or overwrites* keys it sees in a patch; it can't delete one,
since the merge starts from a full copy of the old object and only touches keys
present in the new one. Arrays (`blacklist`, `focus.blockDomains`, `pinnedSites`,
etc.) don't have this problem — `deepMerge` replaces an array wholesale via
`patch.slice()`. This bit two existing features (category-mapping removal,
site-limit clearing) before being caught and fixed in v1.4.0; `saveSettingsKey`
exists specifically to sidestep it for any future nested-object deletion.

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
(fields `phase`, `cycle`, `workMs`, `breakMs`; plus `longBreakMs`/`longBreakEvery`
— every Nth completed work cycle earns the longer break when configured, else the
normal break). Blocking is enforced only during `work` phases via `blockingLive()`.
Two modes (`mode`): **block** (block the chosen categories/domains) or **allow**
(block everything *except* the allowed ones). Both modes combine categories with an
explicit per-domain list (`blockDomains`/`allowDomains`), all edited in the focus
Settings panel. While a work phase is live, `chrome.tabs.onUpdated` (and `enforceAllTabs`
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
- **Per-site hourly** (`stats.domainHourly` → the full 24h shape;
  `stats.domainPeakHour` → its busiest hour): both from the per-domain `dh` map.
  The drill-down charts the hourly shape next to the daily timeline.
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
- **`getLive` is read-only.** It reports the open segment but does **not** commit
  or reset `state.since` — only browser events and the 1-minute tick commit time.
  This keeps the popup/dashboard live poll from amplifying writes. Reported live
  seconds are bounded by `MAX_SEGMENT_SECONDS`. Use `flush` when you actually want
  to force a commit (the dashboard does this once on load).

## Tests

From `dist/`, `npm test` (or `node --test`) runs the suite (74 cases):

- **Unit** (`utils.test.js`, `stats.test.js`, `i18n.test.js`) — the pure modules,
  imported directly (includes `generateInsights`, `domainPeakHour`,
  `domainHourly`, `firstLastVisit`, `passphraseStrength`, and cross-language
  key/placeholder parity across all six `i18n.js` dictionaries).
- **Integration** (`backup.integration.test.js`, `tracking.integration.test.js`,
  `focus.integration.test.js`) — exercise the real `storage.js`/`backup.js`/
  `crypto.js` and the `background.js` tracking + focus engines against an in-memory
  **mock of the chrome.* APIs**. The sync mock enforces Google's real quotas
  (8 KB/item, 100 KB total); the tracking/focus mocks drive tabs/idle events and
  the Pomodoro state machine with a controllable clock; the tracking mock also
  records `chrome.notifications.create` calls and can fire `onButtonClicked` and
  the `ttt_backup` alarm directly, so the 80%/100%/snooze limit-notification
  flow and the storage-quota warning are driven end-to-end, not just unit-tested.
  These caught a real sync-quota bug (and, in v1.4.0, the `deepMerge`
  key-deletion bug), so keep them green when touching backup, tracking, or focus.

What tests can't cover here: DOM rendering (popup/dashboard), chart output, and
the focus-mode tab redirect — those need the extension loaded in a real browser.

## Ideas / not-yet-done

- Google Drive OAuth backup (see note above).
- Extending `DEFAULT_DOMAIN_CATEGORY` (`categories.js`) and `MULTI_TLDS`
  (`utils.js`) for domains/TLDs more common outside Israeli/US/global-English
  usage — the UI text is now translated into all 6 languages, but the built-in
  category defaults still skew toward he/en-market sites.
- Scheduled focus (auto-start a session at set times / weekdays).
- Site-table virtualization for very large histories; an onboarding tour with
  demo data.
- A dedicated Webtime Tracker importer (the generic CSV import covers migration
  today, but not their native export format directly).
- Weekly email summary (only an in-browser notification exists today).
- Automate the `store-assets/site/` → `gh-pages` deploy (currently a manual copy
  + push) — e.g. a GitHub Actions workflow triggered on changes to that folder.
- Category time budgets (weekly cap per category, distinct from the existing
  per-site/day `siteLimits`); arbitrary custom-range-vs-custom-range comparison
  (`stats.trend()` is already generic — today's UI only ever feeds it
  this-week-vs-last-week); a focus-score trend line + "best week"; a goal-met
  streak distinct from the tracking streak; bulk actions on the Sites tab
  (multi-select rows → categorize/blacklist/limit together).

Done in 1.2.0 (previously listed here): per-site **hourly** timeline in the
drill-down (uses the per-domain `dh` map), and reaching the blacklist / focus
per-domain settings from the UI. Done in 1.3.0: UI translated into Arabic,
Russian, Spanish, and French (6 languages total); the marketing/privacy site.
Done in 1.4.0: preview-before-restore, passphrase strength meter, merge-conflict
counts, 80%-approaching limit warnings + snooze, first/last-visit timestamps,
the settings search box, pinned sites, and domain rename/alias-merge.
