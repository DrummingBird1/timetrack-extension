# Chrome Web Store — Listing & Submission Pack

Everything you need to paste into the Developer Dashboard, plus the answers the
review form expects. Store-listing text can be entered per language in the
dashboard (no manifest changes needed). Current release: **1.5.0**.

---

## 1. Basic listing

- **Name:** TimeTrack — Smart Browsing Time Tracker
- **Category:** Productivity
- **Default language:** Hebrew (add English as an additional listing locale; the
  short descriptions below cover all six UI languages)
- **Website / support:** https://github.com/DrummingBird1/timetrack-extension
- **Privacy policy URL:** https://drummingbird1.github.io/timetrack-extension/ ✅ **live**
  (hosted on GitHub Pages; contains no personal data). It must be redeployed
  (merge to `main` → `pages.yml`) so it matches the 1.5.0 policy text before you submit.

### Short description (≤132 chars)

- **EN (113):** Track active time per site — analytics, budgets, focus mode & encrypted backup. Private, local-first, no account.
- **HE (97):** מעקב זמן גלישה פעיל לכל אתר — ניתוח חכם, תקציבים, מצב פוקוס וגיבוי מוצפן. פרטי ומקומי, ללא חשבון.
- **AR (104):** تتبّع وقت التصفح الفعلي لكل موقع — تحليلات وميزانيات ووضع تركيز ونسخ احتياطي مشفّر. خاص ومحلي، بلا حساب.
- **RU (121):** Учёт активного времени на сайтах: аналитика, бюджеты, режим фокуса и шифрованный бэкап. Приватно, локально, без аккаунта.
- **ES (121):** Mide tu tiempo activo por sitio: análisis, presupuestos, modo concentración y copia cifrada. Privado y local, sin cuenta.
- **FR (125):** Mesurez votre temps actif par site : analyses, budgets, mode concentration et sauvegarde chiffrée. Privé, local, sans compte.

### Detailed description

**English**

> TimeTrack measures how much time you actually spend on each website — privacy-
> first and local-first. All data stays on your device; nothing is sent anywhere
> unless you turn on a backup you control.
>
> • Accurate active-time tracking (pauses when you're idle)
> • Smart category breakdown + a 0–100 focus score, with a weekly trend and your best week
> • Weekday × hour heatmap, trends, and a comparison of any two date ranges
> • Per-site drill-down with daily and hourly timelines (and an optional visit log)
> • Daily & weekly goals, per-site limits, weekly category budgets, and a weekly summary
> • Focus mode (Pomodoro) — block distracting categories or sites, or allow-list only
>   what you need; schedule sessions, use strict mode, or take a 10-minute pass
> • Sites tab built for large histories, with bulk actions (categorize, limit, pin, untrack)
> • Import from CSV (including RescueTime-style exports); export JSON/CSV any time
> • Encrypted cloud backup with a restore preview before you commit
> • Fully keyboard- and screen-reader-accessible; light/dark themes
> • Six languages — Hebrew, English, Arabic, Russian, Spanish, French
>
> No external dependencies, no remote code, no analytics, no third-party trackers.
> Site icons are generated locally so no domain you visit ever leaves your device.

**עברית**

> TimeTrack מודד כמה זמן אתה באמת מבלה בכל אתר — בגישה שמכבדת פרטיות ושומרת הכל
> מקומית. כל הנתונים נשארים במכשיר שלך; שום דבר לא נשלח לשום מקום אלא אם תפעיל
> גיבוי שאתה שולט בו.
>
> • מעקב זמן פעיל מדויק (משהה אוטומטית בחוסר פעילות)
> • פילוח קטגוריות חכם + ציון פוקוס 0–100, עם מגמה שבועית והשבוע הטוב ביותר שלך
> • מפת חום יום×שעה, מגמות והשוואה בין כל שני טווחי תאריכים
> • פירוט לכל אתר עם ציר זמן יומי ושעתי (ויומן ביקורים אופציונלי)
> • יעדים יומיים ושבועיים, מגבלות לכל אתר, תקציבים שבועיים לקטגוריות וסיכום שבועי
> • מצב פוקוס (Pomodoro) — חסימת קטגוריות או אתרים, או רשימת היתר בלבד; סשנים
>   מתוזמנים, מצב קפדני או הפסקה של 10 דקות
> • לשונית אתרים שמותאמת להיסטוריה גדולה, עם פעולות מרוכזות (קטגוריה, מגבלה, הצמדה, אי-מעקב)
> • ייבוא מ-CSV (כולל קבצי ייצוא בסגנון RescueTime) וייצוא JSON/CSV בכל עת
> • גיבוי ענן מוצפן עם תצוגה מקדימה לפני שחזור
> • נגיש במלואו למקלדת ולקוראי מסך; ערכות נושא בהיר/כהה
> • שש שפות — עברית, אנגלית, ערבית, רוסית, ספרדית, צרפתית
>
> ללא תלויות חיצוניות, ללא קוד מרוחק, ללא אנליטיקס וללא מעקב צד-שלישי.

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

1.5.0 adds **no new permissions** (enforced by `dist/tests/package.test.js`).

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
  target (Google sync or the user's own HTTPS endpoint), optionally AES-256
  encrypted. Backups and exports never contain the passphrase or endpoint token.
  Link the privacy policy URL.

---

## 5. Required visual assets

| Asset | Spec | Status |
|-------|------|--------|
| Store icon | 128×128 PNG | ✅ `../extension/icons/icon128.png` |
| Screenshots | 1280×800 JPEG/PNG, 1–5 images | ✅ `screenshots/he/` and `screenshots/en/` (5 each) |
| Small promo tile | 440×280 PNG/JPEG | ✅ `promo/promo-tile-440x280.png` |
| Marquee promo (optional) | 1400×560 | ✅ `promo/promo-marquee-1400x560.png` |

All of these are generated from the real UI and the brand mark, so they can be
refreshed after any UI change:

```bash
cd dist
node tools/screenshots.mjs          # he + en; --langs all for the other four (git-ignored)
node tools/promo-tiles.mjs          # tile + marquee (uses screenshots/en/01-overview.jpg)
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
- [x] `version` in `extension/manifest.json` is **1.5.0**; `CHANGELOG.md` and the
      release banner are in place.
- [ ] Merge `v2-foundations` into `main` (this also redeploys the site so the live
      privacy policy matches 1.5.0).
- [x] Chrome Web Store developer account — the owner already has one.
- [ ] Fill single-purpose, permission justifications, and data disclosures
      (sections 2–4).
- [ ] Build the upload zip: `pwsh dist/build.ps1` (zips `extension/`),
      then upload the resulting `dist/timetrack-v1.5.0.zip`. Tagging `v1.5.0`
      also builds it in CI (`release.yml`) and attaches it to the GitHub Release.
- [ ] Bump `version` for every later upload.

### Already hardened

- `web_accessible_resources` uses `"use_dynamic_url": true`; the focus-mode redirect
  is covered by `dist/e2e/focus.e2e.mjs`.
- Install-warning strings are not localized via `_locales` (the in-app UI switches
  language at runtime). Optional, if you want the store to show the manifest
  name/description per locale.

### Other browsers

See [`BROWSER_SUPPORT.md`](BROWSER_SUPPORT.md) (Edge works as-is; Firefox needs a port).
