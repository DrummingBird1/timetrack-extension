<p align="center">
  <img src="store-assets/promo/readme-banner.svg" alt="TimeTrack" width="100%" />
</p>

<p align="center">
  <a href="https://github.com/DrummingBird1/timetrack-extension/actions/workflows/test.yml"><img src="https://github.com/DrummingBird1/timetrack-extension/actions/workflows/test.yml/badge.svg" alt="Tests"></a>
  <a href="https://github.com/DrummingBird1/timetrack-extension/releases/latest"><img src="https://img.shields.io/github/v/release/DrummingBird1/timetrack-extension?label=release" alt="Latest release"></a>
  <a href="https://drummingbird1.github.io/timetrack-extension/"><img src="https://img.shields.io/badge/website-live-6366f1" alt="Website"></a>
</p>

<p align="center">
  <b>English</b> ·
  <a href="README.he.md">עברית</a> ·
  <a href="README.ar.md">العربية</a> ·
  <a href="README.ru.md">Русский</a> ·
  <a href="README.es.md">Español</a> ·
  <a href="README.fr.md">Français</a>
</p>

# TimeTrack — a privacy-first browsing-time tracker

A modern Chrome extension that measures how much active time you spend on each
website — a privacy-first, local-first alternative to Webtime Tracker, with deep
analytics, goals, cloud backup, and data export.

**[🌐 Website](https://drummingbird1.github.io/timetrack-extension/)** ·
**[📋 Changelog](CHANGELOG.md)** ·
**[🔒 Privacy Policy](store-assets/PRIVACY.md)**

> All data stays **local** on your device. Nothing is sent anywhere unless you
> explicitly enable cloud backup.

## ✨ Features

- **Smart, automatic tracking** — counts only *active* time: window focused and
  you're not idle. Optionally keep counting while background audio plays.
- **Modern design** — dark/light/auto themes, full RTL support, smooth
  hand-rolled charts.
- **Rich dashboard** with 4 tabs:
  - **Overview** — summary cards (today / range / average / focus score /
    streak), a trend chart over time, category breakdown, and top sites.
  - **Sites** — a searchable, sortable table with time, visits, share, and a
    per-site limit; **pin** sites to the top, and search **all history**, not
    just the selected range.
  - **Smart insights** — a weekday × hour heatmap, hourly distribution,
    productive vs. distracting time, and your busiest hour.
  - **Settings** — full control, with a **settings search box** to find
    anything fast.
- **Smart categories** — automatic site classification (productivity, social
  media, entertainment, news, and more) + a **0–100 focus score**. Every
  classification is editable.
- **Focus mode (Pomodoro)** — work→break cycles that block distracting sites,
  an "allow-list" mode (block everything except what you allow), **long
  breaks** every few cycles, block/allow by **specific domain** (not just
  category), and keyboard shortcuts (Alt+Shift+F).
- **Untracked sites** — a list of sites that are never counted, managed from
  Settings or straight from a site's detail view ("Don't track this site"),
  where you can also **merge history between domains** (e.g. when a site
  rebrands) and see **first/last visit**.
- **Automated insights** — "Social media up 30% from last week", your busiest
  day, and more.
- **CSV import & real site icons (optional)** — a migration path from other
  trackers.
- **Goals & limits** — a daily time limit, a per-site limit, daily and weekly
  goals, an **80%-approaching warning** before the over-limit alert (with a
  1-hour snooze button on the notification itself), and an automatic weekly
  summary.
- **Period comparison & site detail** — this week vs. last week, and clicking a
  site opens a daily timeline **plus an hourly breakdown** (that site's peak
  hours).
- **Custom date ranges** — alongside the quick ranges (today / 7 / 30 / 90 /
  all).
- **Encrypted cloud backup** — sync to Google or a custom server (HTTPS), with
  optional AES-256 passphrase encryption (zero-knowledge, with a **passphrase
  strength meter**), and a **preview before restoring** (day range, total time,
  site count) so you never restore blind.
- **Export/import** — JSON (full backup) and CSV (everything, or just the
  current view).
- **Six languages** — Hebrew, English, Arabic, Russian, Spanish, and French,
  with live switching.
- **Privacy** — no host permissions, no external tracking, no involuntary
  network calls (icons are generated locally), automatic deletion of old data.

## 🚀 Installation

Since the extension isn't in the Chrome Web Store yet, install it in developer
mode:

1. Open `chrome://extensions`
2. Enable **Developer mode** (top-right corner)
3. Click **Load unpacked**
4. Select the **`extension/`** folder (this is the folder loaded/uploaded to
   the store)
5. Pin the extension to your toolbar — and start browsing 🎉

Clicking the icon opens a quick popup; the "Open full dashboard" button opens
the dashboard.

## ☁️ Setting up cloud backup

- **Google Sync** — enable "Sync to Google account" in Settings. Data backs up
  automatically through Chrome's own sync mechanism (capped at ~100KB; oldest
  days are trimmed if needed, but your local data stays complete).
- **Custom server** — enter a URL (and optional token) for an endpoint you
  control; the extension `POST`s the full backup to it.
- **File** — you can always export JSON/CSV manually and save it wherever you
  like.

## 🔧 Development

No build step, no dependencies — pure modular JavaScript. The test suite (74
cases) runs from `dist`:

```bash
cd dist
npm test               # node --test (no external dependencies)
pwsh build.ps1          # builds the upload zip from extension/
```

For architecture, the data model, and a full file map, see
**[CLAUDE.md](CLAUDE.md)**.

## 📁 Structure

```
extension/               ← the shippable extension (load/upload this folder)
  manifest.json          — extension config (MV3)
  background.js          — the tracking engine (service worker)
  src/lib/                — shared logic (storage, stats, charts, backup, crypto, i18n)
  src/popup/               — the quick popup
  src/dashboard/            — the full dashboard
  src/blocked/              — the focus-mode block page
  icons/                  — icons
store-assets/            ← store assets: privacy policy, listing copy, images
  site/                  — marketing website source (published to GitHub Pages)
dist/                    ← dev tooling: tests, package.json, build.ps1, and the built zip
archive/                 ← superseded assets (old images/build versions)
```

## 🔒 Permissions and why they're needed

| Permission | Use |
|---|---|
| `storage` / `unlimitedStorage` | Store time data and settings locally |
| `tabs` | Identify the active tab's domain |
| `idle` | Stop counting while you're inactive |
| `alarms` | Periodic saving and automatic backup |
| `notifications` | Alerts for time limits |
| `favicon` (optional) | Real site icons from Chrome's local cache — only if manually enabled |

No `host` permission, and no access to page content — only the domain name.
