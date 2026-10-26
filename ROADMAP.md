# Roadmap

> עברית: מפת הדרכים של TimeTrack בקצרה (באנגלית). אין התחייבות לתאריכים.

A status list for **TimeTrack**, the privacy-first, local-first time tracker for Chrome. It shows what has shipped, what needs a decision and what is only an idea. There are no dates, and items can change or be dropped. The detailed history is in the [CHANGELOG](CHANGELOG.md).

## Shipped

- **v1.6.0 — Categories for six markets.** 472 more built-in site categories (565 in total) for Israel, Spanish- and French-speaking countries, Russia and the Arab world; subdomain defaults now match correctly; the extension name and shortcut labels are localized; store listing in six languages.
- **v1.5.0 — Foundations and depth.** Real-Chrome end-to-end tests, typecheck, an accessibility pass and keyboard support; category budgets, comparison across any range, focus-score trend and best week, goal streak, scheduled / strict / snoozable focus with history, an opt-in visit log, bulk site actions, tolerant CSV import, demo-data onboarding.
- **v1.4.0 — Backup and sites trust.** Preview before restore, passphrase strength meter, merge-conflict counts, 80% limit warnings with snooze, settings search, pinned sites, domain rename and alias merge.
- Interface languages: Hebrew, English, Arabic, Russian, Spanish and French.

## Needs a decision

None of these is a small change; each starts with a choice.

- **Multi-device merge** — which device wins, how two day records combine, and whether `storage.sync` is the transport.
- **Multi-product hosts** (google.com, microsoft.com, office.com) — Gmail, Docs and Search currently land in one category; fixing it changes stored keys.
- **Webtime Tracker importer** — needs a real sample of their export. Generic CSV and RescueTime-style files already import.
- **Edge listing and a Firefox port** — nothing is tested on either yet.

## Backlog

- Backup to Google Drive (needs a per-user OAuth client, which conflicts with the install-and-go promise).
- Keep growing the default categories as new sites turn up.
- Refresh the Public Suffix List every few months.
- Tags and projects above categories, only if there is demand.
- Achievements panel, command palette, weekly summary notification, chime on focus phase changes, shareable weekly recap image, scheduled local file export.

## Deliberately not planned

- **Toggl CSV importer** — Toggl tracks manual project time, not website domains.
- **True multi-version backup history** — conflicts with the `chrome.storage.sync` quota; your own exported JSON files already serve as history.

Ideas and bug reports are welcome as [issues](https://github.com/DrummingBird1/timetrack-extension/issues).
