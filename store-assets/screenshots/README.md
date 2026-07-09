# Screenshots — how to capture (the one thing that needs the running extension)

The Chrome Web Store **requires at least one screenshot** (up to 5). They must show
the extension's *actual* UI — generated/fake mockups are against policy. Capture
these after loading the extension (see below).

## Spec
- Size: **1280×800** (preferred) or **640×400**, PNG or JPEG (24-bit, no alpha).
- 1–5 images. Put the strongest first — it's the listing's hero image.

## Load the extension first
1. `chrome://extensions` → enable **Developer mode**.
2. **Load unpacked** → select the **`extension/`** folder.
3. Browse a few sites for a minute so there's sample data, or import a demo backup.

## Recommended shots (4 strong ones)
1. **Dashboard → Overview** — summary cards, trend chart, category donut, top sites.
2. **Dashboard → Insights** — the weekday × hour heatmap + category breakdown.
3. **Dashboard → Sites** — the searchable table + a site drill-down modal open.
4. **Popup** — live counter, today's top sites, and the focus-mode section.
   (Capture the 360-px popup on a clean background, or use the dashboard shots.)

## Tips
- Use the **dark theme** for a premium look consistent with the promo art.
- Set the language to match the listing locale (Hebrew listing → Hebrew UI).
- Crop/pad each shot to exactly 1280×800 so nothing is auto-scaled by the store.

## Sibling assets (already prepared)
- `../promo/promo-tile-440x280.png` — small promo tile.
- `../promo/promo-marquee-1400x560.png` — marquee promo tile.
- Store icon 128×128: `../../extension/icons/icon128.png`.
