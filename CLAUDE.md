# CLAUDE.md

Guidance for Claude / AI assistants and developers working in this repository.

## What this is

**TimeTrack** is a Chrome extension (Manifest V3) that measures how much time the
user actively spends on each website — a privacy-first, local-first alternative
to Webtime Tracker. It adds deep analytics, smart categorization, goals/limits,
cloud backup, and data export.

All data lives **locally** in `chrome.storage.local`. Nothing is sent anywhere
unless the user explicitly enables a backup target. The UI is available in six
languages (Hebrew is the default and the source language; Hebrew and Arabic are RTL).
Current version: **1.5.0** (see `CHANGELOG.md`).

## Repository layout

Four top-level folders, plus `.github/` and root docs (`README*.md`, `CHANGELOG.md`,
`CONTRIBUTING.md`):

- **`extension/`** — the shippable extension (this is what you load-unpacked and
  zip for the store). Self-contained: `manifest.json`, `background.js`, `icons/`,
  `src/`.
- **`store-assets/`** — everything for the Chrome Web Store listing itself:
  `PRIVACY.md`, `STORE_LISTING.md`, `BROWSER_SUPPORT.md` (Edge/Firefox notes — not
  tested), `promo/` (promo graphics + per-release banners), `screenshots/` (he/en
  committed, generated), and `site/` (the marketing website source, deployed to the
  `gh-pages` branch — see below).
- **`dist/`** — dev tooling and build output: the test suites (`tests/` unit +
  integration, `e2e/` real-browser), `tools/` (generators, see the file map),
  `package.json`, `tsconfig.json`, `build.ps1`, and the zip(s) it produces
  (`timetrack-v<version>.zip`, gitignored). Despite the name, nothing here ships
  inside the extension — `build.ps1` zips `extension/`'s contents only.
- **`.github/`** — CI (`workflows/`: `test.yml`, `e2e.yml` named "Checks", `release.yml`,
  `pages.yml`), issue forms and the PR template.
- **`archive/`** — superseded assets kept for reference (old screenshots/promo
  images, old build zips). Not part of the current release; see `archive/README.md`.

Paths below are relative to `extension/`.

## Marketing site (GitHub Pages)

`store-assets/site/index.html` is the source of truth for the public site at
`https://drummingbird1.github.io/timetrack-extension/` — a single self-contained
file (inline CSS/SVG/JS, no external requests, no build step), matching the
extension's own no-dependency ethos. It has a runtime language switcher (a
`STR` dict + `data-t` attributes, `localStorage`-persisted) covering the same
six languages as the extension itself (he/en/ar/ru/es/fr) — deliberately a
separate, much smaller pattern from `extension/src/lib/i18n.js` (the site isn't
part of the shippable extension bundle, so it has its own compact dictionary,
~25 keys vs. the extension's ~380). The privacy-policy section shows only the
currently-selected language's card (translated per language, not just en/he
shown side-by-side); its content mirrors `store-assets/PRIVACY.md` — keep both
in sync (across **all six languages**) when the policy changes. Any change to what
data is stored or where it can go (e.g. the optional session log, the focus
history) **must** update the policy, the six site cards and `STORE_LISTING.md`'s
data disclosures together; `docs.test.js` guards the parts it can.
**Deploying:** `.github/workflows/pages.yml` copies `store-assets/site/*` (including
`.nojekyll`) to the `gh-pages` branch whenever that folder changes on `main`
(or via "Run workflow"). It has never run on GitHub yet — the first merge to `main`
that touches the site is its real test; the old manual fallback is to copy the files
to the `gh-pages` root and push.

## READMEs and release banners

**READMEs are per-language**: `README.md` (English, primary/canonical — GitHub
renders this one by default and it's what search engines index) plus
`README.he.md`/`README.ar.md`/`README.ru.md`/`README.es.md`/`README.fr.md`,
all cross-linked via the language-switcher row at the top of each file. When
the feature list or any other shared section changes, **update all six** — the
English one first (it's the source), then propagate. `dist/tests/docs.test.js`
fails if the six files diverge in structure (sections, feature-bullet count, the
language switcher) or mention a stale test command; it can't check that the
translations say the same thing, so that part is still on you.

**Every GitHub Release gets its own banner image** at the top of its notes —
this is deliberate, not decorative: it makes the releases page scannable and
gives each version a distinct identity while keeping one consistent brand (same
mark, palette, and wordmark across all of them; only the version number and a
theme icon change). Generate one with:

```bash
node dist/make-release-banner.mjs <version> <themeKey> "<tagline>"
```

This writes `store-assets/promo/releases/v<version>.svg`. Pick (or add) a
`themeKey` in that script that reflects what the release actually shipped —
e.g. `cloud` for a backup-focused release, `globe` for a languages/i18n
release, `shield` for a security/hardening release — the same way v1.1.0–v1.5.0
were themed (see the script's `THEMES` map; add a new icon there for a release
that doesn't fit the existing ones, rather than reusing a mismatched theme).

**The banner must be committed and pushed to `main` before referencing it in
release notes** — release notes embed it via the raw-content URL
(`https://raw.githubusercontent.com/DrummingBird1/timetrack-extension/main/store-assets/promo/releases/v<version>.svg`),
which only resolves once the file exists on `main`.

**Releasing** is now mostly automated. The steps for a new version `X.Y.Z`:

1. Bump `version` in `extension/manifest.json`, add a `## [X.Y.Z] — date` section to
   `CHANGELOG.md`, generate the banner (above). `docs.test.js` fails until all three
   agree.
2. Regenerate the store screenshots (the sidebar shows the version):
   `node dist/tools/screenshots.mjs` (and `promo-tiles.mjs` if the UI changed).
3. Merge to `main`, then push the tag `vX.Y.Z`. `release.yml` verifies tag == manifest
   version and that the banner exists, runs the unit tests, builds the zip with
   `pwsh dist/build.ps1`, composes the release notes from the CHANGELOG section
   (`dist/tools/release-notes.mjs`, banner pinned to the tag) and runs
   `gh release create`. It has not run on GitHub yet — watch the first run.
4. Upload the zip to the Chrome Web Store by hand (`store-assets/STORE_LISTING.md`).

## Trello roadmap board

There's a dedicated Trello board mirroring this roadmap:
**[TimeTrack — Roadmap](https://trello.com/b/xwEI2Qz8/timetrack-roadmap)**
(workspace "Projects"), with four lists: **✅ Done** (one card per shipped
version/milestone, e.g. "v1.4.0 — Backup & sites trust"), **🔜 Next up** (mirrors
this file's "Ideas / not-yet-done" section below, one card per item), **🗄️
Backlog / later**, and **❌ Cut / won't do** (documents rejected ideas with the
reasoning, so they aren't re-litigated). Keep the board in sync whenever the
roadmap changes here: moving a card from "Next up" to "Done" when a feature
ships (and adding a version-summary card there), adding new cards when new
ideas come up, and updating "Ideas / not-yet-done" below and the board
together — they should never drift apart.

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

Dev tooling lives in `dist/` and uses **pnpm** (never npm — see the root `CLAUDE.md`):

```bash
cd dist
pnpm install
pnpm exec puppeteer browsers install chrome   # once — Chrome for Testing, for the E2E suite
pnpm test            # unit + integration (node --test), ~200 tests, seconds
pnpm typecheck       # tsc --checkJs over the extension, 0 errors expected
pnpm test:e2e        # real extension in Chrome for Testing, ~60 tests, a couple of minutes
```

`dist/pnpm-workspace.yaml` sets `allowBuilds: puppeteer: false` (pnpm 11 otherwise
aborts the install on puppeteer's postinstall); don't run `pnpm install` from the repo
root — it would create a stray root `package.json`/`node_modules`.

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
the worker for actions (toggle tracking, flush, run backup, prune, focus control).

**The UI ⇄ worker protocol lives in one file, `src/lib/messages.js`**: `MessageMap`
types every request/response (checked by `tsc`), `sendMessage()` is the only way the
UI sends, and `parseMessage()` is the gate the worker validates through (it also
ignores messages from other senders). Adding a message means adding it to
`MessageMap` + `MESSAGE_TYPES` there and a `case` in `handleMessage()`;
`messages.test.js` fails if the two lists drift.

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
- When `sessionLog` is on, each committed segment is also recorded as a visit
  (`recordSession`, below). `checkLimits` raises the daily / per-site / weekly
  category-budget notifications; `checkFocusSchedule` (run from the tick) starts
  scheduled focus sessions.

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
- `ttt_sess_<YYYY-MM-DD>` — **optional** (schema v3, only while `settings.sessionLog`
  is on): that day's visits as `[domain, startSecond, seconds]`, adjacent segments of
  the same site merged when the gap is ≤ `SESSION_GAP_SECONDS`. Powers the per-site
  visit-length distribution. Not part of the day record; file export includes them by
  default, the `storage.sync` backup does not (`exportAll({ sessions: false })` — they
  wouldn't fit the quota).
- `ttt_focuslog` — finished focus sessions (capped at 300), for the focus history.

Schema is **v3** (`SCHEMA_VERSION`; v2 added the per-domain `dh` map, v3 the optional
session keys). `storage.migrate()` runs on `init()`; the v3 step is intentionally a
no-op (the new keys are simply absent until the feature is switched on).

Why per-day records: each tracking commit rewrites only one small object instead
of one giant blob, which keeps writes cheap as history grows. Measured: reading three
years of history takes ~90 ms, so pre-aggregated rollups were deliberately not built —
revisit only if `scale.e2e.mjs` starts failing its budget.

**Domains** are bucketed by registrable domain when `groupSubdomains` is on
(`mail.google.com` → `google.com`) using the real **Public Suffix List**, baked into
`src/lib/psl.js` (generated by `dist/tools/build-psl.mjs`; refresh it every few
months, it is a normal reviewed commit — the extension never fetches it). Because the
private section is included, `alice.github.io` and `bob.github.io` are separate sites.
IPv4/IPv6 addresses and single-label hosts (`localhost`) are never grouped.

## File map

| File | Responsibility |
|------|----------------|
| `manifest.json` | MV3 manifest. Permissions: storage, tabs, idle, alarms, notifications, unlimitedStorage. |
| `background.js` | Service worker = tracking engine + message router + alarms. |
| `src/lib/utils.js` | Pure helpers: dates/day-keys, domain extraction (`registrableDomain`), duration formatting, favicons. No chrome/DOM. |
| `src/lib/psl.js` | **Generated** Public Suffix List rules (`dist/tools/build-psl.mjs`) — don't edit by hand. |
| `src/lib/storage.js` | All `chrome.storage.local` access: settings (+ map-setting helpers, write lock), per-day read/write, session logs, focus log, index, prune, export/import, migrations. |
| `src/lib/categories.js` | Category definitions + default domain→category map + `categorize()`. |
| `src/lib/stats.js` | **Pure** analytics over day records (aggregation, categories, focus score + weekly trend, heatmap, streaks, trends, budgets, session stats, any-range comparison). |
| `src/lib/charts.js` | Dependency-free SVG charts (bar, donut, heatmap, sparkline). CSP-safe; gradient ids are unique per chart. |
| `src/lib/backup.js` | Cloud backup: `storage.sync` chunked by *stored* size, custom REST endpoint, `runAutoBackup`. |
| `src/lib/crypto.js` | Optional AES-256-GCM backup encryption (PBKDF2 key from passphrase), optionally gzipping first. |
| `src/lib/compress.js` | gzip/gunzip via the platform's CompressionStream (size-capped on read), base64 helpers, the plaintext compressed wrapper. |
| `src/lib/i18n.js` | Small core: `t()`, `localize()`, direction/locale tables, lazy per-language loading. |
| `src/lib/locales/{he,en,ar,ru,es,fr}.json` | The UI strings (~380 keys each), `fetch()`ed on demand. Add keys with `dist/tools/add-strings.mjs`. |
| `src/lib/messages.js` | The typed UI ⇄ worker protocol (`MessageMap`, `sendMessage`, `parseMessage`). |
| `src/lib/csvimport.js` | Tolerant CSV parser/mapper for imports (aliased headers, RescueTime-style, hourly detail). |
| `src/lib/demo.js` | Removable demo data for the welcome screen (`loadDemo` / `removeDemo`). |
| `src/popup/*` | Toolbar popup: today total, live counter, top sites, 7-day mini chart, tracking toggle, focus session. |
| `src/dashboard/dashboard.js` | Entry: tab roles & keyboard, wiring; registers handlers in `core.js`'s `actions`. |
| `src/dashboard/core.js` | Shared state (`settings`, `currentRange`, `cache`… exported as ES live bindings with setters), `$`/`$$`, `send`, `actions` registry (avoids import cycles), modal helpers. |
| `src/dashboard/{overview,compare,budgets,sites,siteDetail,insights,settings,settingsEditors,dataio,demo}.js` | One module per area of the Overview / Sites / Insights / Settings tabs. |
| `src/blocked/*` | Focus-mode block page (with "allow 10 minutes"; none in strict mode). |
| `dist/tests/*.test.js` | `node:test` unit + integration tests (`pnpm test`); `helpers/` holds the chrome.* mocks. |
| `dist/e2e/*.e2e.mjs` | Puppeteer end-to-end tests against the real extension; `harness.mjs` launches Chrome for Testing with it loaded. |
| `dist/tools/` | `add-strings` (add a UI string to all six locales), `build-psl`, `fixture` (deterministic synthetic history), `screenshots` + `promo-tiles` (store graphics), `release-notes` (CHANGELOG → release body). |
| `dist/tsconfig.json`, `dist/types/` | `tsc --checkJs` setup; `chrome-storage.d.ts` fixes `storage.get()` result typing. |
| `dist/package.json` | Dev-only (scripts + devDependencies, `"type":"module"`); the extension has no deps/build. |
| `dist/build.ps1` | Builds `timetrack-v<version>.zip` from `extension/` (store upload). |
| `dist/make-release-banner.mjs` | Generates a themed per-version GitHub Release banner SVG — see "READMEs and release banners". |
| `store-assets/PRIVACY.md` / `STORE_LISTING.md` / `BROWSER_SUPPORT.md` | Privacy policy, Chrome Web Store submission pack, Edge/Firefox notes. |
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
- **Accessibility is enforced, not aspirational.** axe-core runs over every screen, in
  both themes and an RTL language (`a11y.e2e.mjs`), and `contrast.test.js` computes
  WCAG AA ratios straight from the CSS tokens. Use the *text-safe* tokens for text
  (`--accent-text`, `--dim`, `--faint`, …) and the plain `--accent` only for fills and
  borders; give every control an accessible name (`data-i18n-aria` / `data-i18n-ph`,
  or `aria-labelledby` on settings rows); keep tabs/rows/dialogs keyboard-operable
  (modals go through `watchModals`: focus trap, Escape, focus restore). Inline
  `<span>`s ignore `width`/`height` — progress fills need `display:block`.
- **Types:** the code is plain JS, type-checked with `pnpm typecheck` (`tsc --checkJs`,
  `noUnusedLocals`, 0 errors expected). Annotate with JSDoc; DOM lookups in the
  dashboard use the `any`-typed `$`/`$$` from `core.js`.
- **i18n:** UI text lives in `src/lib/locales/<lang>.json` — six languages: `he`
  (default, source, RTL), `en`, `ar` (RTL), `ru`, `es`, `fr`. They are `fetch()`ed
  lazily (the service worker can't `import()` JSON), so `setLang()` is **async** —
  always `await` it. In HTML use `data-i18n` / `data-i18n-ph` (also becomes the
  `aria-label`) / `data-i18n-title` / `data-i18n-aria` and call `localize()`; in JS use
  `t(key, vars)`. **Add strings with `node dist/tools/add-strings.mjs new.json`**, which
  writes all six files and refuses a missing language or a `{placeholder}` mismatch;
  `i18n.test.js` fails the build if any language's key set or placeholders drift from
  `he`, and an E2E test loads every language and fails on a raw key in the UI.
  Direction/locale come from the
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

1.5.0 added: `sessionLog` (opt-in visit log, off by default), `categoryBudgets`
(weekly seconds-per-category caps), and under `focus`: `strict` (no early exit /
pause) and `schedule` (auto-start entries, fired by `checkFocusSchedule` with a
10-minute grace window).

`categoryMap`, `siteLimits` and `categoryBudgets` are **plain objects**, not arrays
(the list is `MAP_SETTINGS`) — `deepMerge` (the engine behind `saveSettings`) only
ever *adds or overwrites* keys it sees in a patch; it can't delete one, since the
merge starts from a full copy of the old object and only touches keys present in the
new one. So **`saveSettings` throws for a map key**: use
`setSettingsMapEntry(key, entryKey, value)` / `removeSettingsMapEntry(key, entryKey)`
(and the `…Entries` batch forms), or `saveSettingsKey(key, wholeValue)`. Arrays
(`blacklist`, `focus.blockDomains`, `pinnedSites`, `focus.schedule`…) don't have this
problem — `deepMerge` replaces an array wholesale via `patch.slice()`. This bit two
features (category-mapping removal, site-limit clearing) before v1.4.0 and was made
unrepresentable in 1.5.0.

Every settings write goes through `withSettingsLock`: read-modify-write without it
lost updates when two changes landed together (`backup.integration.test.js`:
"concurrent settings writes…"), so don't read settings, mutate and `chrome.storage.local.set` them yourself.

## Cloud backup

Two zero-infra targets plus manual file I/O:

1. **`chrome.storage.sync`** (`backupToSync`/`restoreFromSync`): serializes the
   snapshot (without session logs), **gzips it** (`compress.js`; encrypted backups gzip
   *before* encrypting — `encryptJSON(obj, pass, { gzip: true })` sets `zip: 'gzip'` on the
   envelope), and splits the result into chunks (`ttt_sync_<n>` + `ttt_sync_meta`) to
   respect the 8,192-byte/item, 102,400-byte/total sync quota.
   **The quota counts key + `JSON.stringify(value)` in UTF-8 bytes** — a JSON string
   full of `"` roughly doubles in size once escaped, which is why chunks are sized by
   their real *stored* size (`chunkForSync`, `SYNC_ITEM_BYTES`/`SYNC_TOTAL_BYTES`),
   the total is verified. `daysThatFit` picks how many of the newest days fit (binary
   search on the *compressed* size, estimated without encrypting since PBKDF2 is slow),
   then the real packed size is checked and the day count tightened if the estimate was
   optimistic. If history still exceeds the quota, **oldest days are left out** of the
   sync copy (local data is untouched): ~365 days survive on the synthetic 3-year fixture,
   up from 83 (plaintext) / 59 (encrypted) before compression. gzip only gets ~4.6× on
   this data, so it is a year of history, not a decade.
   The write is **all-or-nothing and non-destructive**: one `set()` overwrites the old
   chunks and the meta, *then* leftover chunks are removed (only a quota error falls back
   to freeing the old copy first). `meta.sha` (SHA-256 of the payload) is verified on
   restore, because another device receives the items one by one and could otherwise read
   a mix of two backups. Restore understands every format ever written (plain, encrypted,
   compressed, compressed + encrypted). `sync.e2e.mjs` checks all of this against real
   Chrome's quotas; what no local test can show is Google actually delivering the items
   to a second signed-in device.
   The old character-count chunking passed the mock and failed in real Chrome with
   `kQuotaBytesPerItem` — keep the sync mock in `backup.integration.test.js` (`measure`) byte-accurate.
2. **Custom REST endpoint** (`backupToEndpoint`): `POST` the snapshot to an
   **HTTPS-only** URL (enforced) with an optional `Authorization: Bearer <token>`.
3. **File export/import** (`exportAll`/`importAll` in `storage.js`, wired in the
   dashboard): JSON (full, re-importable) and CSV (full or current-view rows).
   Import modes: `merge` (keeps the larger time/visits per domain/day — safe to
   re-import) or `replace` (wipe first). Import auto-detects encrypted envelopes.
   The CSV importer (`csvimport.js`) accepts aliased headers, RescueTime-style
   exports and optional hourly columns, and reports skipped rows.

**Secrets never travel in snapshots.** `exportAll` strips `backup.passphrase` and
`backup.endpointToken` (`stripSecrets`) from every target (file, sync, endpoint);
`importAll` keeps this device's own credentials instead of overwriting them, and
forces `encrypt` off when there is no passphrase (so a restore can't silently turn
encryption into a no-op). Before 1.5.0 both were exported in clear text.

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

1.5.0 additions: **strict mode** (`focus.strict`, snapshotted into the session) removes
every escape hatch during a work phase — `stopFocus` is refused (`{refused:true}`),
the popup hides "end", the keyboard command does nothing, and the block page shows no
snooze. Otherwise the block page offers **"allow 10 minutes"** (`snoozeFocus` sets
`pausedUntil`; `blockingLive` honours it and `checkFocusExpiry` resumes enforcement).
**Scheduled sessions** (`focus.schedule`) start from the 1-minute tick
(`checkFocusSchedule`; fired entries are deduped in `storage.session` so a worker
restart can't double-start). Finished sessions are appended to `ttt_focuslog`
(`logFocusSession`) and summarised by `stats.focusLogStats` on the Insights tab.

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
- **Weekly focus-score trend / best week** (`stats.weeklyFocusScores`, `bestWeek`) and
  the **goal-met streak** (`stats.goalStreak`, distinct from the tracking streak).
- **Category budgets** (`stats.categorySeconds`, `budgetStatus`): weekly caps; progress
  bars on Overview (`budgets.js`), 80% / 100% notifications from `checkLimits`.
- **Any-range comparison** (`compare.js` → `stats.trend` + `stats.siteChanges`): the
  Overview compares this-vs-previous period, or any two custom ranges, with the
  biggest per-site movers.
- **Visit-length distribution** (`stats.sessionStats` over the optional session log,
  rendered in the site drill-down).

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
  resize/theme change via `rerenderCharts()`. SVG ids must be unique per chart:
  `url(#id)` resolves to the first match in the document, and a gradient inside a
  hidden tab doesn't render (this made every later chart's bars invisible until 1.5.0).
- **Branded Chrome ≥ 137 ignores `--load-extension`**, so the E2E suite uses *Chrome for
  Testing* (`pnpm exec puppeteer browsers install chrome`) with `enableExtensions`.
  The SW's in-memory `lastDomain`, and the real `chrome.idle` state of the machine
  ("locked" when you're away), can affect tracking tests — see `tracking` in
  `focus.e2e.mjs` for the idle-aware assertion.
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

Four layers, all from `dist/` (pnpm — see "How to run"):

- **Unit** — `pnpm test` (`node --test`, ~190 cases, seconds). The pure modules are
  imported directly: `utils`, `stats`, `analytics` (budgets, weekly trend, goal streak,
  comparison), `sessions`, `csvimport`, `demo`, `psl`, `messages`, and cross-language
  key/placeholder parity across the six locale files (`i18n.test.js`).
- **Integration** (`backup.integration.test.js`, `tracking.integration.test.js`,
  `focus.integration.test.js`) — the real `storage.js`/`backup.js`/`crypto.js` and the
  `background.js` tracking + focus engines against an in-memory **mock of the chrome.*
  APIs**. The sync mock enforces Google's real quotas (8,192 B/item, 102,400 B total,
  measured as key + JSON in UTF-8 bytes); the tracking/focus mocks drive tabs/idle
  events and the Pomodoro state machine with a controllable clock, record
  `chrome.notifications.create` calls, and can fire `onButtonClicked` and the
  `ttt_backup` alarm — so limit/budget notifications, snooze, scheduled focus and the
  storage-quota warning are driven end-to-end. Keep them green when touching backup,
  tracking or focus.
- **Guards** — `package.test.js` (the permission set is exactly the documented one, no
  host permissions, CSP-safe pages, every import resolves), `contrast.test.js` (WCAG AA
  from the CSS tokens), `docs.test.js` (READMEs, site translations and privacy cards
  in parity; manifest/CHANGELOG/banner agree on the version), `release-notes.test.js`.
- **End-to-end** — `pnpm test:e2e` (`--test-concurrency=1`, ~60 cases, a couple of
  minutes): Puppeteer drives the *real* extension in Chrome for Testing. `smoke`
  (loads, popup, every tab), `dashboard` (every tab and feature: charts, sites,
  bulk actions, settings, backup→restore, export/import, budgets, compare, demo
  data…), `focus` (popup session, block/allow redirects, tracking, strict/snooze),
  `scale` (3 years of synthetic history stays within time budgets), `sync` (cloud backup against real Chrome's storage.sync quotas), `a11y` (axe-core
  on every screen in both themes and RTL, plus keyboard behaviour). When you fix a bug
  here, add the regression test and run it against the old code to see it fail first
  (the unique-gradient-id test was checked that way). `pnpm typecheck` is the fifth check.

Test data comes from `tools/fixture.mjs` (deterministic, seeded — never `Math.random`).

CI (`.github/workflows/`) runs the unit tests (`test.yml`) and typecheck + E2E
(`e2e.yml`, check name "Checks") on every PR to `main` — both ran green on the 1.5.0 PR
(#1, Ubuntu / UTC). `release.yml` (fires on a `v*.*.*` tag) and `pages.yml` (fires on a merge to
`main` that touches `store-assets/site/`) **have not run on GitHub yet**; they cannot be
executed locally, so treat their first runs as part of the release.

What isn't covered: a final human look at a fresh profile, other browsers (see
`store-assets/BROWSER_SUPPORT.md`), and anything that needs real Google Sync or a real
backup endpoint.

## Ideas / not-yet-done

Kept in sync with the Trello board's **🔜 Next up** and **🗄️ Backlog** lists.

- **First real runs of `release.yml` and `pages.yml`** (merge PR #1, tag `v1.5.0`), then
  the Chrome Web Store submission (the owner has a developer account) — pack in
  `store-assets/STORE_LISTING.md`.
- **Multi-device merge** — needs a design decision first (which device wins, how to
  merge day records, whether `storage.sync` is the transport).
- **A dedicated Webtime Tracker importer** — needs a real sample of their export (the
  generic CSV import, incl. RescueTime-style files, covers migration meanwhile).
- **Edge Add-ons listing** (same zip) and a possible **Firefox port** — see
  `store-assets/BROWSER_SUPPORT.md`; none of it is tested.
- Google Drive OAuth backup (see note above).
- Extending `DEFAULT_DOMAIN_CATEGORY` (`categories.js`) for sites more common outside
  Israeli/US/global-English usage — the UI is in six languages, but the built-in
  category defaults still skew toward he/en-market sites.
- Refresh `psl.js` every few months (`node dist/tools/build-psl.mjs`).
- Deferred ideas: tags, achievements, a command palette, a weekly email summary (only
  an in-browser notification exists today).

Done in 1.2.0: per-site **hourly** timeline in the drill-down (uses the per-domain `dh`
map), and reaching the blacklist / focus per-domain settings from the UI. Done in 1.3.0:
UI translated into Arabic, Russian, Spanish, and French (6 languages total); the
marketing/privacy site. Done in 1.4.0: preview-before-restore, passphrase strength
meter, merge-conflict counts, 80%-approaching limit warnings + snooze, first/last-visit
timestamps, the settings search box, pinned sites, and domain rename/alias-merge.
Done in 1.5.0: see `CHANGELOG.md` — real-browser E2E + typecheck + a11y foundations,
secret-free backups and a fixed sync quota, the full PSL, category budgets, weekly
focus-score trend / best week / goal streak, any-range comparison, scheduled / strict /
snoozable focus + history, opt-in session log, bulk site actions at scale, tolerant CSV
import, demo-data onboarding, lazy locales, a typed worker protocol, and CI/release/site
automation.
