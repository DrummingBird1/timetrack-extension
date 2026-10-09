# Store screenshots

The Chrome Web Store needs 1–5 screenshots (1280×800, JPEG or 24-bit PNG) that show
the extension's **actual** UI. These are captured from the real, loaded extension in a
browser with deterministic synthetic browsing data — nothing is mocked up by hand.

| File | Shows |
|------|-------|
| `01-overview.jpg` | Dashboard → Overview: summary cards, insights, trend chart, categories, budget |
| `02-site-detail.jpg` | Dashboard → Sites: a site's drill-down with the visit-length distribution |
| `03-insights.jpg` | Dashboard → Insights: heatmap, focus-score trend, focus history |
| `04-popup.jpg` | The toolbar popup (live counter, focus mode, top sites) |
| `05-focus-mode.jpg` | The focus-mode block page |

`he/` and `en/` are committed (the default listing locales); upload `he/*` to the
Hebrew listing and `en/*` to the English one. Folders for the other four languages are
git-ignored and generated on demand.

## Regenerate

After any UI change, or a version bump (the sidebar shows the version):

```bash
cd dist
pnpm install
pnpm exec puppeteer browsers install chrome     # once; Chrome for Testing
node tools/screenshots.mjs                      # he + en
node tools/screenshots.mjs --langs all          # all six (ar/ru/es/fr are git-ignored)
node tools/promo-tiles.mjs                      # promo tile + marquee, from en/01-overview.jpg
```

Dashboard shots use a 1600×1000 layout rendered at 0.8× so a 1280×800 frame holds the
charts below the summary cards. The popup (380 px wide) is centred on a 1280×800 canvas.

Look at the output before uploading — the generator can't tell you a screenshot looks
wrong, only that it rendered.
