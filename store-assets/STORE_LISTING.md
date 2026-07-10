# Chrome Web Store — Listing & Submission Pack

Everything you need to paste into the Developer Dashboard, plus the answers the
review form expects. Store-listing text can be entered per language in the
dashboard (no manifest changes needed).

---

## 1. Basic listing

- **Name:** TimeTrack — Smart Browsing Time Tracker
- **Category:** Productivity
- **Default language:** Hebrew (add English as an additional listing locale)
- **Website / support:** https://github.com/DrummingBird1/timetrack-extension
- **Privacy policy URL:** https://drummingbird1.github.io/timetrack-extension/ ✅ **live**
  (hosted on GitHub Pages; contains no personal data).

### Short description (≤132 chars)

- **EN:** Track active time per site, with smart analytics, focus mode, goals, and
  encrypted cloud backup. Private & local-first.
- **HE:** מעקב זמן גלישה פעיל לכל אתר — פילוח חכם, מצב פוקוס, יעדים וגיבוי ענן
  מוצפן. פרטי ומקומי לחלוטין.

### Detailed description

**English**

> TimeTrack measures how much time you actually spend on each website — privacy-
> first and local-first. All data stays on your device; nothing is sent anywhere
> unless you turn on a backup you control.
>
> • Accurate active-time tracking (pauses when you're idle)
> • Smart category breakdown + a 0–100 focus score
> • Weekday × hour heatmap, hourly distribution, trends & period comparison
> • Per-site drill-down with a daily timeline
> • Daily & weekly goals, per-site limits, and a weekly summary
> • Focus mode (Pomodoro) that blocks distracting sites during a session
> • Encrypted cloud backup (Google sync or your own server) + JSON/CSV export
> • Hebrew & English UI, light/dark themes
>
> No external dependencies, no remote code, no analytics, no third-party trackers.
> Site icons are generated locally so no domain you visit ever leaves your device.

**עברית**

> TimeTrack מודד כמה זמן אתה באמת מבלה בכל אתר — בגישה שמכבדת פרטיות ושומרת הכל
> מקומית. כל הנתונים נשארים במכשיר שלך; שום דבר לא נשלח לשום מקום אלא אם תפעיל
> גיבוי שאתה שולט בו.
>
> • מעקב זמן פעיל מדויק (משהה אוטומטית בחוסר פעילות)
> • פילוח קטגוריות חכם + ציון פוקוס 0–100
> • מפת חום יום×שעה, התפלגות שעתית, מגמות והשוואת תקופות
> • פירוט לכל אתר עם ציר זמן יומי
> • יעדים יומיים ושבועיים, מגבלות לכל אתר, וסיכום שבועי
> • מצב פוקוס (Pomodoro) שחוסם אתרים מסיחים בזמן סשן
> • גיבוי ענן מוצפן (Google או שרת שלך) + ייצוא JSON/CSV
> • ממשק עברית ואנגלית, ערכות נושא בהיר/כהה
>
> ללא תלויות חיצוניות, ללא קוד מרוחק, ללא אנליטיקס וללא מעקב צד-שלישי.

---

## 2. Single-purpose statement (review form)

> TimeTrack's single purpose is to help users understand and manage the time they
> spend browsing websites. All features — analytics, goals/limits, focus mode, and
> backup/export — serve that one purpose.

---

## 3. Permission justifications (review form)

| Permission | Justification to paste |
|------------|------------------------|
| `tabs` | Read the **domain** of the active tab to attribute browsing time to a site. We read only the hostname, never page content; no host permissions or content scripts are used. |
| `storage` / `unlimitedStorage` | Store time records and settings locally; `unlimitedStorage` allows long browsing histories without hitting the default quota. |
| `idle` | Pause time counting when the user is idle, so only *active* time is measured. |
| `alarms` | Periodically commit elapsed time and run optional automatic backups. |
| `notifications` | Notify the user when a time limit is reached and deliver the optional weekly summary. |
| `favicon` *(optional)* | Requested **only at runtime** if the user turns on "Real site icons". Displays site icons from Chrome's **local** favicon cache (`_favicon/`) instead of the generated letter avatars. No network requests and no extra data access; off by default, and removed when the user turns it off. |
| `web_accessible_resources` (block page) | During a focus session, redirect a blocked tab to the extension's own block page. |

---

## 4. Data-usage disclosures (Privacy practices tab)

- **Data collected:** *Web history* — the list of website domains and time spent.
  (Disclose this category.)
- **Authentication / personal / financial / health / location / etc.:** None.
- **Certifications (must all be true and checked):**
  - ☑ I do **not** sell or transfer user data to third parties (outside the user's
    own opt-in backup target).
  - ☑ I do **not** use or transfer data for purposes unrelated to the single purpose.
  - ☑ I do **not** use or transfer data to determine creditworthiness or for lending.
- **Data handling:** stored locally; transmitted only to a user-configured backup
  target (Google sync or the user's own HTTPS endpoint), optionally AES-256
  encrypted. Link the privacy policy URL.

---

## 5. Required visual assets

| Asset | Spec | Status |
|-------|------|--------|
| Store icon | 128×128 PNG | ✅ `../extension/icons/icon128.png` |
| Screenshots | 1280×800 **or** 640×400 PNG/JPEG, 1–5 images | ❌ **still needed** — see `screenshots/README.md` |
| Small promo tile | 440×280 PNG/JPEG | ✅ `promo/promo-tile-440x280.png` |
| Marquee promo (optional) | 1400×560 | ✅ `promo/promo-marquee-1400x560.png` |

The only missing visual is **screenshots**, which must show the real running UI
(see `screenshots/README.md` for exact shots and specs).

---

## 6. Pre-publish checklist

- [ ] **Manually test in Chrome** (load unpacked): popup, dashboard tabs, charts,
      language switch, theme, focus-mode redirect, backup → restore round-trip,
      export/import. *(Logic is unit/integration-tested; the UI is not yet
      click-tested in a real browser.)*
- [x] Host the privacy policy publicly — ✅ live at
      https://drummingbird1.github.io/timetrack-extension/ (paste into the
      listing's Privacy policy field).
- [ ] Capture screenshots (`screenshots/README.md`). Promo tiles are ready in `promo/`.
- [ ] Register a Chrome Web Store developer account ($5 one-time).
- [ ] Fill single-purpose, permission justifications, and data disclosures
      (sections 2–4).
- [ ] Bump `version` in `extension/manifest.json` for each upload.
- [ ] Build the upload zip: `pwsh store-assets/dev/build.ps1` (zips `extension/`),
      then upload the resulting `store-assets/dev/timetrack-v<version>.zip`.

### Optional hardening (verify in-browser first)

- **`web_accessible_resources` → `"use_dynamic_url": true`** reduces extension
  fingerprinting (sites can't probe a static block-page URL). **Caution:** it
  changes the block-page URL per session — confirm the focus-mode redirect still
  works after enabling, since `chrome.tabs.update()` must resolve the dynamic URL.
- **Localized store listing / manifest** via `_locales` if you want the install
  warning strings localized (the in-app UI already switches he/en at runtime).
