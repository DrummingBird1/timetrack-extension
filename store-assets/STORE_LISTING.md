# Chrome Web Store — Listing & Submission Pack

<!-- descriptions-reviewed-for: 2.0.1 -->
<!-- Iron rule: every release re-reads the descriptions (short, detailed, READMEs, site copy) against what the extension now offers,
     fixes what is stale, and only then bumps the version above. dist/tests/docs.test.js fails until it matches manifest.json. -->

Everything you need to paste into the Developer Dashboard, plus the answers the
review form expects. Store-listing text can be entered per language in the
dashboard (no manifest changes needed). Current release: **2.0.1** (1.7.0 is already in
the Store).

---

## 1. Basic listing

- **Name:** TimeTrack — Smart Browsing Time Tracker (`appName`, translated in
  `extension/_locales/<lang>/messages.json`)
- **Category:** Productivity
- **Default language:** English — it matches `default_locale` in the manifest. Then add
  Hebrew, Arabic, Russian, Spanish and French as listing languages: the dashboard only
  offers languages that exist under `extension/_locales/`, and each one needs its own
  detailed description (below). Screenshots can be localized per language too:
  `screenshots/he/*` for Hebrew, `screenshots/en/*` for the others.
- **Website / support:** https://github.com/DrummingBird1/timetrack-extension
- **Privacy policy URL:** https://drummingbird1.github.io/timetrack-extension/ ✅ **live**
  (hosted on GitHub Pages; contains no personal data). It must be redeployed
  (merge to `main` → `pages.yml`) so it matches the 1.5.0 policy text before you submit.

### Short description (≤132 chars)

The Store takes the title and this summary from the package, not from a dashboard field:
they are `appName` / `appDescription` in `extension/_locales/<lang>/messages.json`, one file per
language (`en`, `he`, `ar`, `ru`, `es`, `fr`). The English one is shown here; edit them in the
package. `docs.test.js` fails if the English text here and `_locales/en` disagree, and checks that every
language's summary is 60-132 characters.

- **EN (122):** Track active time per site — analytics, tags, budgets, focus mode & backups you control. Private, local-first, no account.

### Detailed description

Plain text: the Store's description box has no Markdown. English is written here and is the primary text;
`listing-text/description-en.txt` is generated from it with `node dist/tools/listing-text.mjs`, and
`docs.test.js` fails if it goes stale. Every other language is its own plain-text file by language code,
`listing-text/description-<lang>.txt` (`he`, `ar`, `ru`, `es`, `fr`), edited by hand and kept to the same
structure (an intro, then the same titled sections and bullets); the test checks that.

**English**

> TimeTrack shows where your time really goes — privacy-first and local-first. Everything stays on your device; nothing is sent anywhere unless you turn on a backup you control.
>
> ■ TRACKING & INSIGHTS
> • Accurate active time: only focused, non-idle time counts (optionally also while audio plays)
> • Smart categories for hundreds of popular sites in every supported language, all editable, plus a 0–100 focus score with a weekly trend and your best week
> • Weekday × hour heatmap, plain-language insights (late-night use, new sites, your most productive hour) and a comparison of any two date ranges
> • Per-site drill-down with daily and hourly timelines, and an optional visit log
> • A Sites tab built for big histories: search everything, pin sites, merge a renamed site, and categorize, limit or untrack many at once
>
> ■ GOALS & FOCUS
> • Daily and weekly goals, per-site limits, and weekly budgets for categories and for your own tags, with 80% and 100% alerts
> • Focus mode (Pomodoro): block distracting sites or allow only what you need; schedule sessions, use strict mode or take a 10-minute pass
> • Achievements for streaks, focus sessions and more, kept on your device only
>
> ■ MAKE IT YOURS
> • Tags: group sites your own way (Work, Study…) with a time-by-tag view and weekly budgets
> • Command palette (Ctrl/Cmd+K): jump to any screen or site, or run an action from the keyboard
> • Weekly or monthly HTML reports, saved to a folder you choose or downloaded on demand
>
> ■ BACKUP & YOUR DATA
> • Back up to your Google account, your own HTTPS server, a WebDAV server with version history, or a folder on your computer, on a schedule and with optional AES-256 encryption
> • Verify a backup without restoring it, preview before you restore, restore only a date range or only your settings, and get a warning when backups stop working
> • Import from CSV (including RescueTime-style files); export JSON or CSV any time
>
> ■ PRIVATE BY DESIGN
> • No account, no analytics, no remote code, no third-party trackers; site icons are generated locally, so no domain you visit leaves your device
> • Old data is deleted automatically after a period you choose
>
> ■ FOR EVERYONE
> • Six languages with live switching: Hebrew, English, Arabic, Russian, Spanish, French (right-to-left supported)
> • Light and dark themes, keyboard shortcuts, keyboard and screen-reader accessibility, and a short first-run setup

---

## 2. Single-purpose statement (review form)

> TimeTrack's single purpose is to help users understand and manage the time they
> spend browsing websites. All features — analytics, goals/limits/budgets, focus
> mode, and backup/export — serve that one purpose.

---

## 3. Permission justifications (review form)

| Permission | Justification to paste |
|------------|------------------------|
| `tabs` | Read the **domain** of the active tab to attribute browsing time to a site. We read only the hostname, never page content; no host permissions or content scripts are used. |
| `storage` / `unlimitedStorage` | Store time records and settings locally; `unlimitedStorage` allows long browsing histories without hitting the default quota. |
| `idle` | Pause time counting when the user is idle, so only *active* time is measured. |
| `alarms` | Periodically commit elapsed time, start scheduled focus sessions, and run optional automatic backups. |
| `notifications` | Notify the user when a time limit or category budget is reached and deliver the optional weekly summary. |
| `favicon` *(optional)* | Requested **only at runtime** if the user turns on "Real site icons". Displays site icons from Chrome's **local** favicon cache (`_favicon/`) instead of the generated letter avatars. No network requests and no extra data access; off by default, and removed when the user turns it off. |
| `web_accessible_resources` (block page) | During a focus session, redirect a blocked tab to the extension's own block page. Uses `use_dynamic_url`, so sites cannot probe for the extension. |

1.5.0, 1.6.0, 1.7.0, 2.0.0 and 2.0.1 add **no new permissions** (enforced by `dist/tests/package.test.js`).

---

## 4. Data-usage disclosures (Privacy practices tab)

- **Data collected:** *Web history* — the list of website domains and time spent
  (and, only if the user enables the optional visit log, when each visit started
  and how long it lasted). (Disclose this category.)
- **Authentication / personal / financial / health / location / etc.:** None.
- **Certifications (must all be true and checked):**
  - ☑ I do **not** sell or transfer user data to third parties (outside the user's
    own opt-in backup target).
  - ☑ I do **not** use or transfer data for purposes unrelated to the single purpose.
  - ☑ I do **not** use or transfer data to determine creditworthiness or for lending.
- **Data handling:** stored locally; transmitted only to a user-configured backup
  target (Google sync, the user's own HTTPS endpoint, or the user's own WebDAV
  server), optionally AES-256 encrypted. Backups and exports never contain the
  passphrase, the endpoint token or the WebDAV password (the WebDAV user name and
  password stay on the device and are sent only to that server, to sign in). Backup files and summary
  reports can also be written into a folder the user picks on their own computer.
  The extension stores a random install ID (included in backups) and the date each
  achievement was reached; neither identifies the user.
  Link the privacy policy URL.

---

## 5. Required visual assets

| Asset | Spec | Status |
|-------|------|--------|
| Store icon | 128×128 PNG | ✅ `icon/store-icon-128.png` (the same file as the extension's `icon128.png`; a 512×512 version and the SVG are beside it) |
| Screenshots | 1280×800 JPEG/PNG, 1–5 images | ✅ `screenshots/he/` and `screenshots/en/` (5 each) |
| Small promo tile | 440×280 PNG/JPEG | ✅ `promo/promo-tile-440x280.png` |
| Marquee promo (optional) | 1400×560 | ✅ `promo/promo-marquee-1400x560.png` |

All of these are generated from the real UI and the brand mark, so they can be
refreshed after any UI change:

```bash
cd dist
node tools/screenshots.mjs          # he + en; --langs all for the other four (git-ignored)
node tools/promo-tiles.mjs          # tile, marquee, link preview (uses screenshots/en/*.jpg)
node tools/icons.mjs                # toolbar icons + icon/ (Store icon, 512 px logo, SVG)
```

Upload `screenshots/he/*` to the Hebrew listing and `screenshots/en/*` to the English one.

---

## 6. Pre-publish checklist

- [x] UI verified in a real browser — the Puppeteer end-to-end suite (`pnpm test:e2e`)
      drives the loaded extension: popup, every dashboard tab, charts, language
      switch, focus-mode redirect, backup → restore round-trip, export/import,
      accessibility (axe-core). A final manual smoke test of a fresh profile is still wise.
- [x] Host the privacy policy publicly — https://drummingbird1.github.io/timetrack-extension/
- [x] Screenshots and promo graphics captured / generated (section 5).
- [x] `version` in `extension/manifest.json` is **1.7.0**; `CHANGELOG.md` and the
      release banner are in place.
- [x] Merge `v2-foundations` into `main` (this also redeploys the site so the live
      privacy policy matches 1.5.0).
- [x] Chrome Web Store developer account — the owner already has one.
- [ ] Fill single-purpose, permission justifications, and data disclosures
      (sections 2–4).
- [x] Tag `v1.5.0` pushed: `release.yml` built the zip and attached it to the
      [GitHub Release](https://github.com/DrummingBird1/timetrack-extension/releases/tag/v1.5.0)
      (its 45 files are identical to `extension/`). Upload that zip — or build the same one
      with `pwsh dist/build.ps1` → `dist/timetrack-v1.5.0.zip`.
- [x] **Upload the zip** in the Developer Dashboard — 1.5.0 is in the Store.
- [x] **1.6.0:** merged to `main` and uploaded to the Store (2026-10-24, per the owner). The
      `v1.6.0` tag and GitHub Release are still to do.
- [x] **1.7.0:** merged, tagged `v1.7.0` and uploaded to the Store.
- [x] **2.0.0:** merged and tagged `v2.0.0` (GitHub Release); superseded by 2.0.1 before the Store upload.
- [ ] **2.0.1:** merged and tagged `v2.0.1`; upload that Release's `timetrack-v2.0.1.zip` (it carries the
      refreshed short descriptions) and paste the detailed descriptions. The notes below apply to it as they did to 2.0.0. No new permissions. Data disclosures (section 4) and the
      privacy policy are updated for the new local data (tags, achievements, install ID) and the
      two optional destinations (a local folder, a WebDAV server). In the Store's Privacy practices tab
      the declared category stays *Web history*; paste each language's
      `listing-text/description-<lang>.txt` again and use the new screenshots.
- [ ] **1.6.0 listing:** in the dashboard's Store listing tab, set the default language to
      English, add Hebrew, Arabic, Russian, Spanish and French from the language dropdown, and
      paste each language's `listing-text/description-<lang>.txt` into its Description box.
- [ ] Bump `version` for every later upload.

### Already hardened

- `web_accessible_resources` uses `"use_dynamic_url": true`; the focus-mode redirect
  is covered by `dist/e2e/focus.e2e.mjs`.
- The manifest's name, description and shortcut labels are localized through
  `extension/_locales/` (six languages, `default_locale` is `en`), which is also what lets
  the dashboard offer a per-language listing. The in-app UI is separate: it switches language
  at runtime from `src/lib/locales/`, because `chrome.i18n` is locked to the browser language.
  `package.test.js` keeps the two language sets identical.

### Other browsers

See [`BROWSER_SUPPORT.md`](BROWSER_SUPPORT.md) (Edge works as-is; Firefox needs a port).
