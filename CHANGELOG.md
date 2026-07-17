# Changelog

All notable changes to TimeTrack are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/); this project uses
[Semantic Versioning](https://semver.org/).

## [1.2.0] — 2026-07-17

This release closes the gaps where a setting worked in the engine but had no way
to reach it from the UI, and puts the per-domain hourly data (schema v2) to use.

### Added
- **Untracked-sites editor.** A Settings panel to manage the never-track
  blacklist, plus an "Don't track this site" action in the per-site drill-down.
  (The engine already honored `settings.blacklist`; now it's reachable.)
- **Focus: block/allow specific domains.** The focus panel now edits
  `blockDomains` / `allowDomains` alongside the category chips, so you can block
  or allow a single site without touching a whole category.
- **Per-site hourly timeline.** The site drill-down now charts a site's activity
  by hour-of-day (from the `dh` map), next to the existing daily timeline.
- **Sites: search all history.** A toggle in the Sites tab aggregates and
  searches the entire index, not just the selected date range.
- **Pomodoro long break.** Optional longer break every N cycles
  (`focus.longBreakMinutes` / `longBreakEvery`); off by default.

### Changed
- **`getLive` is now read-only.** Periodic live-status polling from the popup and
  dashboard no longer commits a storage write on every poll — time is committed
  by browser events and the 1-minute tick. The live counter is bounded by the
  same segment cap used for crediting.

### Fixed
- **Real favicons self-heal.** If the optional `favicon` permission is later
  revoked from Chrome, the popup and dashboard fall back to the generated letter
  avatars on load instead of showing broken icons.

### Notes
- Tests now cover the new pure logic and engine paths (51 cases, up from 48):
  `domainHourly`, blacklist tracking, and the long-break state machine.
- No schema change (still **v2**); the new `focus.longBreak*` settings default
  off, so existing data and sessions are unaffected.
- Deferred to a later release: Google Drive OAuth backup (needs a per-user OAuth
  client id), site-table virtualization, an onboarding tour, and a dedicated
  Webtime Tracker importer (the generic CSV import already covers migration).
- The UI still needs a manual in-browser pass before publishing — DOM rendering,
  chart output and the focus tab-redirect aren't covered by the automated tests.

## [1.1.0] — 2026-07-10

### Added
- **Focus mode — Pomodoro cycles.** Sessions now run configurable work→break
  cycles with notifications; blocking is enforced only during work phases.
- **Focus mode — allow-list.** New "allow only selected categories" mode that
  blocks everything except what you permit (stronger deep-work mode), alongside
  the existing block-list mode.
- **Automated insights.** The Overview shows plain-language insights comparing
  this week to last (time trend, top category, focus-score change, busiest day).
- **Per-site peak hour.** Day records now keep a per-domain hourly map (`dh`,
  schema v2), so the site drill-down shows a site's busiest *hour*, not just day.
- **Keyboard shortcuts** (`chrome.commands`): Alt+Shift+T toggle tracking,
  Alt+Shift+F start/stop focus, Alt+Shift+D open dashboard.
- **Real site icons (opt-in).** Optional `favicon` permission uses Chrome's local
  icon cache; still off by default (letter avatars stay the private default).
- **CSV import.** Import `date,domain,seconds,visits` CSVs — a migration path
  from other trackers and a round-trip for the CSV export.

### Changed
- Expanded the built-in public-suffix list for more accurate subdomain grouping
  across many more country TLDs.
- Dashboard version label now reads from the manifest; live-status poll relaxed
  from 15s to 30s.
- `web_accessible_resources` now uses `use_dynamic_url` to reduce fingerprinting.

### Fixed
- Focus block page: "back" no longer bounces onto the blocked site (which
  re-triggered the block); during a Pomodoro break the page releases to the site.

### Notes
- Schema bumped to **v2** (additive `dh` field); old data needs no migration.
- Google Drive OAuth backup remains documented-only (needs a per-user OAuth
  client id) — see the note in `CLAUDE.md`.
- The UI still needs a manual in-browser pass before publishing (logic is covered
  by 48 automated tests; DOM rendering is not).

## [1.0.0] — 2026-06-21

### Added
- Initial release: active browsing-time tracking, smart category breakdown and
  focus score, heatmap, trends and period comparison, per-site drill-down, daily
  & weekly goals and per-site limits, focus mode with site blocking, encrypted
  cloud backup (Google sync + custom endpoint), JSON/CSV export, Hebrew/English
  UI, light/dark themes. Local-first, no remote code, minimal permissions.
