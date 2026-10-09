# Contributing to TimeTrack

Thanks for helping! TimeTrack is a privacy-first Chrome extension: **all data stays on the
user's device**, there is **no build step and no runtime dependency**, and the UI ships in
six languages. Those three facts shape most review comments.

Architecture, the data model and a file map are in [CLAUDE.md](CLAUDE.md). This page is the
practical "how do I change something" guide.

## Set up

You need Node 20+ and [pnpm](https://pnpm.io/). The extension itself needs nothing installed;
`dist/` holds dev-only tooling.

```bash
cd dist
pnpm install                                 # Puppeteer, TypeScript, axe-core (dev only)
pnpm exec puppeteer browsers install chrome  # one-time: Chrome for Testing for the E2E suite
```

Load the extension to try it: `chrome://extensions` → Developer mode → **Load unpacked** →
the `extension/` folder.

## Before you open a pull request

```bash
cd dist
pnpm test         # unit + integration tests — fast, no browser
pnpm typecheck    # tsc --checkJs (also fails on unused imports)
pnpm test:e2e     # real Chrome: popup, dashboard, focus mode, accessibility (axe-core)
```

CI runs the same three. A few tests are guards you should know about:

| Test | What it protects |
|---|---|
| `tests/package.test.js` | The permission list is pinned. Adding a permission, a content script, `eval`, remote code or an inline `<script>` fails — these are deliberate, reviewed decisions. |
| `tests/i18n.test.js` | Every language has exactly the same keys and `{placeholders}` as Hebrew. |
| `tests/docs.test.js` | The six READMEs, the site's translations and privacy cards, and the version / CHANGELOG / release banner stay in step. |
| `tests/contrast.test.js`, `e2e/a11y.e2e.mjs` | WCAG AA text contrast and zero axe-core violations on every screen. |

## Adding or changing UI text

All six languages move together. Don't hand-edit six JSON files — use the helper, which checks
that every language is present and the placeholders match:

```bash
# new-strings.json
# { "my.key": { "he": "…", "en": "…", "ar": "…", "ru": "…", "es": "…", "fr": "…" } }
cd dist && node tools/add-strings.mjs new-strings.json
```

In HTML use `data-i18n="my.key"` (text), `data-i18n-ph` (placeholder; also used as the
accessible name), `data-i18n-title` or `data-i18n-aria` (aria-label). In JS use `t('my.key', { vars })`.
Hebrew is the source language; machine-quality translations are fine for a first draft, but
say so in the PR so a native speaker can review.

## Adding a language

1. Copy `extension/src/lib/locales/en.json` to `<code>.json` and translate every value
   (keep `{placeholders}` intact).
2. Add the code to `LANG_META` in `extension/src/lib/i18n.js` (direction + Intl locale), and the
   per-language weekday and duration-unit tables in `extension/src/lib/utils.js`.
3. Add an `<option>` to the language picker in `extension/src/dashboard/dashboard.html`.
4. Add the language to the marketing site (`store-assets/site/index.html`: the `STR` dictionary,
   a `privacy-card`, the picker) and a `README.<code>.md`; the language switcher in every README links to it.
5. Update the `LANGS` list in `dist/tests/i18n.test.js` and `dist/tests/docs.test.js`.

The tests tell you what you missed.

## Code conventions

- **Pure vs effectful:** `utils.js`, `stats.js`, `csvimport.js` and `demo.js`'s generator are free of
  `chrome.*` and the DOM so they can be unit-tested directly. Storage goes through `storage.js`;
  only `background.js` writes tracking data.
- **Settings that are maps** (`categoryMap`, `siteLimits`, `categoryBudgets`) can't be edited with
  `saveSettings()` — it can add but never delete a key. Use `setSettingsMapEntry(ies)` /
  `removeSettingsMapEntry(ies)`; `saveSettings` refuses them.
- **UI ⇄ service worker messages** are declared in `src/lib/messages.js`; add a type there first.
- **Colours:** use the text-safe tokens (`--text-dim`, `--accent-text`, …) for text, not the raw
  brand colours, or the contrast test fails.
- **Privacy:** anything that records a new kind of data must be opt-in or documented in
  `store-assets/PRIVACY.md` **and** the six privacy cards on the site — in the same PR.

## Releases (maintainers)

1. Bump `extension/manifest.json`, add the CHANGELOG entry, and generate the banner:
   `node dist/make-release-banner.mjs <version> <theme> "<tagline>"`.
2. Merge to `main`, then push a `v<version>` tag — `.github/workflows/release.yml` builds the zip
   and creates the GitHub Release (with the banner) from the CHANGELOG section.
3. Changes to `store-assets/site/` deploy to GitHub Pages automatically on merge to `main`.
4. Store submission is manual: see [store-assets/STORE_LISTING.md](store-assets/STORE_LISTING.md).
