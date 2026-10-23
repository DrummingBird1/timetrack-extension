# Chrome Web Store — Listing & Submission Pack

Everything you need to paste into the Developer Dashboard, plus the answers the
review form expects. Store-listing text can be entered per language in the
dashboard (no manifest changes needed). Current release: **1.6.0** (1.5.0 is already in
the Store).

---

## 1. Basic listing

- **Name:** TimeTrack — Smart Browsing Time Tracker (`appName`, translated in
  `extension/_locales/<lang>/messages.json`)
- **Category:** Productivity
- **Default language:** English — it matches `default_locale` in the manifest. Then add
  Hebrew, Arabic, Russian, Spanish and French as listing languages: the dashboard only
  offers languages that exist under `extension/_locales/`, and each one needs its own
  detailed description (below). Screenshots can be localized per language too:
  `screenshots/he/*` for Hebrew, `screenshots/en/*` for the others.
- **Website / support:** https://github.com/DrummingBird1/timetrack-extension
- **Privacy policy URL:** https://drummingbird1.github.io/timetrack-extension/ ✅ **live**
  (hosted on GitHub Pages; contains no personal data). It must be redeployed
  (merge to `main` → `pages.yml`) so it matches the 1.5.0 policy text before you submit.

### Short description (≤132 chars)

The Store takes the title and this summary from the package, not from a dashboard field:
they are `appName` / `appDescription` in `extension/_locales/<lang>/messages.json`. Edit
them there; `docs.test.js` fails if this list and those files disagree.

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

**العربية**

> يقيس TimeTrack الوقت الذي تقضيه فعليًا في كل موقع، مع إعطاء الأولوية للخصوصية
> والتخزين المحلي. تبقى جميع البيانات على جهازك، ولا يُرسل أي شيء إلى أي جهة إلا إذا
> فعّلتَ نسخًا احتياطيًا تتحكم به أنت.
>
> • تتبّع دقيق للوقت الفعلي (يتوقف تلقائيًا عند عدم النشاط)
> • تصنيف ذكي للفئات + درجة تركيز من 0 إلى 100، مع اتجاه أسبوعي وأفضل أسبوع لديك
> • خريطة حرارية لأيام الأسبوع × الساعات، واتجاهات، ومقارنة بين أي فترتين زمنيتين
> • تفاصيل لكل موقع مع مخططات زمنية يومية وبالساعة (وسجل زيارات اختياري)
> • أهداف يومية وأسبوعية، وحدود لكل موقع، وميزانيات أسبوعية للتصنيفات، وملخص أسبوعي
> • وضع التركيز (Pomodoro) — احجب التصنيفات أو المواقع المشتّتة، أو اسمح فقط بما تحتاجه؛
>   جدولة الجلسات، أو الوضع الصارم، أو استراحة لمدة 10 دقائق
> • تبويب مواقع مصمم للسجلات الكبيرة، مع إجراءات جماعية (تصنيف، حد، تثبيت، إيقاف التتبع)
> • استيراد من CSV (بما في ذلك ملفات التصدير بنمط RescueTime) وتصدير JSON/CSV في أي وقت
> • نسخ احتياطي سحابي مشفّر مع معاينة قبل الاستعادة
> • متاح بالكامل للوحة المفاتيح وقارئات الشاشة؛ سمتان فاتحة وداكنة
> • ست لغات — العبرية والإنجليزية والعربية والروسية والإسبانية والفرنسية
>
> بلا تبعيات خارجية، وبلا شيفرة بعيدة، وبلا تحليلات، وبلا متتبّعات من أطراف ثالثة.
> تُنشأ أيقونات المواقع محليًا، فلا يغادر أي نطاق تزوره جهازك.

**Русский**

> TimeTrack измеряет, сколько времени вы действительно проводите на каждом сайте, —
> с приоритетом приватности и локального хранения. Все данные остаются на вашем
> устройстве; ничего никуда не отправляется, пока вы сами не включите резервное
> копирование, которое вы контролируете.
>
> • Точный учёт активного времени (автоматически ставится на паузу, когда вы бездействуете)
> • Умная разбивка по категориям + индекс фокуса от 0 до 100, с недельным трендом и лучшей неделей
> • Тепловая карта «день недели × час», тренды и сравнение любых двух периодов
> • Детализация по каждому сайту с суточной и почасовой шкалой (и необязательным журналом визитов)
> • Дневные и недельные цели, лимиты для сайтов, недельные бюджеты по категориям и недельная сводка
> • Режим фокуса (Pomodoro): блокируйте отвлекающие категории или сайты либо разрешите только
>   нужное; расписание сессий, строгий режим или 10-минутная передышка
> • Вкладка «Сайты» для больших историй с массовыми действиями (категория, лимит, закрепление,
>   прекращение учёта)
> • Импорт из CSV (включая экспорт в стиле RescueTime), экспорт в JSON/CSV в любой момент
> • Зашифрованное облачное резервное копирование с предпросмотром перед восстановлением
> • Полная доступность с клавиатуры и для программ чтения с экрана; светлая и тёмная темы
> • Шесть языков: иврит, английский, арабский, русский, испанский, французский
>
> Без внешних зависимостей, без удалённого кода, без аналитики и сторонних трекеров.
> Значки сайтов создаются локально, поэтому ни один посещённый вами домен не покидает
> ваше устройство.

**Español**

> TimeTrack mide cuánto tiempo dedica realmente a cada sitio web, con la privacidad y el
> almacenamiento local por delante. Todos los datos permanecen en su dispositivo; no se
> envía nada a ningún sitio a menos que active una copia de seguridad que usted controla.
>
> • Seguimiento preciso del tiempo activo (se pausa cuando está inactivo)
> • Desglose inteligente por categorías + una puntuación de enfoque de 0 a 100, con
>   tendencia semanal y su mejor semana
> • Mapa de calor día de la semana × hora, tendencias y comparación de dos rangos de fechas cualesquiera
> • Detalle por sitio con líneas de tiempo diarias y por hora (y un registro de visitas opcional)
> • Objetivos diarios y semanales, límites por sitio, presupuestos semanales por categoría
>   y resumen semanal
> • Modo concentración (Pomodoro): bloquee categorías o sitios que distraen, o permita solo
>   lo que necesita; programe sesiones, use el modo estricto o tómese un descanso de 10 minutos
> • Pestaña de sitios pensada para historiales grandes, con acciones masivas (categorizar,
>   limitar, fijar, dejar de seguir)
> • Importación desde CSV (incluidas exportaciones al estilo RescueTime) y exportación a JSON/CSV en cualquier momento
> • Copia de seguridad cifrada en la nube con vista previa antes de restaurar
> • Totalmente accesible con teclado y lector de pantalla; temas claro y oscuro
> • Seis idiomas: hebreo, inglés, árabe, ruso, español y francés
>
> Sin dependencias externas, sin código remoto, sin analíticas y sin rastreadores de terceros.
> Los iconos de los sitios se generan localmente, así que ningún dominio que visite sale de su dispositivo.

**Français**

> TimeTrack mesure le temps que vous passez réellement sur chaque site web, en plaçant la
> confidentialité et le stockage local au premier plan. Toutes les données restent sur votre
> appareil ; rien n'est envoyé nulle part, sauf si vous activez une sauvegarde que vous contrôlez.
>
> • Suivi précis du temps actif (se met en pause lorsque vous êtes inactif)
> • Répartition intelligente par catégorie + un score de concentration de 0 à 100, avec
>   tendance hebdomadaire et votre meilleure semaine
> • Carte de chaleur jour de la semaine × heure, tendances et comparaison de deux périodes au choix
> • Détail par site avec chronologies quotidienne et horaire (et un journal des visites facultatif)
> • Objectifs quotidiens et hebdomadaires, limites par site, budgets hebdomadaires par catégorie
>   et résumé hebdomadaire
> • Mode concentration (Pomodoro) : bloquez les catégories ou les sites qui distraient, ou
>   n'autorisez que l'essentiel ; planifiez des sessions, utilisez le mode strict ou accordez-vous
>   une pause de 10 minutes
> • Onglet Sites conçu pour les gros historiques, avec des actions groupées (catégoriser,
>   limiter, épingler, ne plus suivre)
> • Import depuis CSV (y compris les exports de type RescueTime) et export JSON/CSV à tout moment
> • Sauvegarde cloud chiffrée avec aperçu avant restauration
> • Entièrement accessible au clavier et aux lecteurs d'écran ; thèmes clair et sombre
> • Six langues : hébreu, anglais, arabe, russe, espagnol, français
>
> Sans dépendances externes, sans code distant, sans analytique et sans traceurs tiers.
> Les icônes des sites sont générées localement : aucun domaine que vous visitez ne quitte votre appareil.

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

1.5.0 and 1.6.0 add **no new permissions** (enforced by `dist/tests/package.test.js`).

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
- [x] `version` in `extension/manifest.json` is **1.6.0**; `CHANGELOG.md` and the
      release banner are in place.
- [x] Merge `v2-foundations` into `main` (this also redeploys the site so the live
      privacy policy matches 1.5.0).
- [x] Chrome Web Store developer account — the owner already has one.
- [ ] Fill single-purpose, permission justifications, and data disclosures
      (sections 2–4).
- [x] Tag `v1.5.0` pushed: `release.yml` built the zip and attached it to the
      [GitHub Release](https://github.com/DrummingBird1/timetrack-extension/releases/tag/v1.5.0)
      (its 45 files are identical to `extension/`). Upload that zip — or build the same one
      with `pwsh dist/build.ps1` → `dist/timetrack-v1.5.0.zip`.
- [x] **Upload the zip** in the Developer Dashboard — 1.5.0 is in the Store.
- [ ] **1.6.0:** merge the release PR to `main`, push the tag `v1.6.0`, then upload that
      Release's `timetrack-v1.6.0.zip`. The release changes no permissions and no stored or
      transmitted data, so the permission justifications and data disclosures are unchanged.
- [ ] Bump `version` for every later upload.

### Already hardened

- `web_accessible_resources` uses `"use_dynamic_url": true`; the focus-mode redirect
  is covered by `dist/e2e/focus.e2e.mjs`.
- The manifest's name, description and shortcut labels are localized through
  `extension/_locales/` (six languages, `default_locale` is `en`), which is also what lets
  the dashboard offer a per-language listing. The in-app UI is separate: it switches language
  at runtime from `src/lib/locales/`, because `chrome.i18n` is locked to the browser language.
  `package.test.js` keeps the two language sets identical.

### Other browsers

See [`BROWSER_SUPPORT.md`](BROWSER_SUPPORT.md) (Edge works as-is; Firefox needs a port).
