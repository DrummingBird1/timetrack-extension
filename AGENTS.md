# TimeTrack

TimeTrack is a Chrome extension (Manifest V3) that measures how much time the user actively spends on each website: a privacy-first, local-first alternative to Webtime Tracker, with analytics, categorization, goals/limits, cloud backup and data export. The UI ships in six languages (Hebrew is the default and source language; Hebrew and Arabic are RTL).

**`CLAUDE.md` is the detailed guide** (repository layout, build and test commands, conventions). Read it before changing anything. This file gives agents that do not read `CLAUDE.md` (Codex, Gemini, Cursor, Grok) an entry point and does not repeat it.

## Rules

- All data stays local in `chrome.storage.local`. Nothing is sent anywhere unless the user enables a backup target. Do not add network calls, telemetry or analytics.
- `extension/` is what ships; `dist/` is dev tooling and build output (the zip is git-ignored). `archive/` is not part of the current release.
- User-visible strings must exist in all six languages.
- Changes go through a branch and a pull request; CI ("Checks") must pass; do not push to `main` and do not force-push. Do not publish a release without the owner's approval.
