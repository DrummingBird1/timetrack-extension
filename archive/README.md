# Archive

Superseded assets, kept for reference — not part of the current release.

- `screenshots/` — Chrome Web Store screenshots captured against the pre-1.3
  dashboard UI (before the untracked-sites editor, focus per-domain lists, and
  hourly drill-down chart existed). Superseded; new store screenshots need to be
  recaptured against the current UI per `store-assets/screenshots/README.md`.
- `promo/` — the original promo tile (440×280) and marquee (1400×560), replaced
  by the promotional graphics generated for the v1.3 marketing site
  (`store-assets/promo/`).
- `old-builds/` — extension zips from earlier releases. Not git-tracked (build
  output), kept here purely for local tidiness: `dist/build.ps1` moves the zip of
  every earlier version here each time it builds a new one. The official copy of
  each release is the zip attached to its GitHub Release.

Git history for the moved files is preserved — `git log --follow` on any file
here shows its full history from before the move.
