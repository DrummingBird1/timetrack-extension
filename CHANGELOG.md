# Changelog

All notable changes to TimeTrack are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/); this project uses
[Semantic Versioning](https://semver.org/).

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
