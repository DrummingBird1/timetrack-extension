# Chrome Web Store — Listing & Submission Pack

<!-- descriptions-reviewed-for: 2.0.0 -->
<!-- Iron rule: every release re-reads the descriptions (short, detailed, READMEs, site copy) against what the extension now offers,
     fixes what is stale, and only then bumps the version above. dist/tests/docs.test.js fails until it matches manifest.json. -->

Everything you need to paste into the Developer Dashboard, plus the answers the
review form expects. Store-listing text can be entered per language in the
dashboard (no manifest changes needed). Current release: **2.0.0** (1.7.0 is already in
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

- **EN (122):** Track active time per site — analytics, tags, budgets, focus mode & backups you control. Private, local-first, no account.
- **HE (106):** מעקב זמן גלישה פעיל לכל אתר — ניתוח חכם, תגיות, תקציבים, מצב פוקוס וגיבוי בשליטתך. פרטי ומקומי, ללא חשבון.
- **AR (112):** تتبّع وقت التصفح الفعلي لكل موقع — تحليلات ووسوم وميزانيات ووضع تركيز ونسخ احتياطي بإشرافك. خاص ومحلي، بلا حساب.
- **RU (120):** Учёт активного времени по сайтам: аналитика, теги, бюджеты, режим фокуса, свои бэкапы. Приватно, локально, без аккаунта.
- **ES (128):** Mide tu tiempo activo por sitio: análisis, etiquetas, presupuestos, enfoque y copias que controlas. Privado y local, sin cuenta.
- **FR (130):** Mesurez votre temps actif par site : analyses, tags, budgets, mode concentration et sauvegardes à vous. Privé, local, sans compte.

### Detailed description

Plain text: the Store's description box has no Markdown. Ready-to-paste copies, one file per
language, are in [`listing-text/`](listing-text/). They are generated from this section with
`node dist/tools/listing-text.mjs`, and `docs.test.js` fails if they go stale.

**English**

> TimeTrack shows where your time really goes — privacy-first and local-first. Everything stays on your device; nothing is sent anywhere unless you turn on a backup you control.
>
> ■ TRACKING & INSIGHTS
> • Accurate active time: only focused, non-idle time counts (optionally also while audio plays)
> • Smart categories for hundreds of popular sites in every supported language, all editable, plus a 0–100 focus score with a weekly trend and your best week
> • Weekday × hour heatmap, plain-language insights (late-night use, new sites, your most productive hour) and a comparison of any two date ranges
> • Per-site drill-down with daily and hourly timelines, and an optional visit log
> • A Sites tab built for big histories: search everything, pin sites, merge a renamed site, and categorize, limit or untrack many at once
>
> ■ GOALS & FOCUS
> • Daily and weekly goals, per-site limits, and weekly budgets for categories and for your own tags, with 80% and 100% alerts
> • Focus mode (Pomodoro): block distracting sites or allow only what you need; schedule sessions, use strict mode or take a 10-minute pass
> • Achievements for streaks, focus sessions and more, kept on your device only
>
> ■ MAKE IT YOURS
> • Tags: group sites your own way (Work, Study…) with a time-by-tag view and weekly budgets
> • Command palette (Ctrl/Cmd+K): jump to any screen or site, or run an action from the keyboard
> • Weekly or monthly HTML reports, saved to a folder you choose or downloaded on demand
>
> ■ BACKUP & YOUR DATA
> • Back up to your Google account, your own HTTPS server, a WebDAV server with version history, or a folder on your computer, on a schedule and with optional AES-256 encryption
> • Verify a backup without restoring it, preview before you restore, restore only a date range or only your settings, and get a warning when backups stop working
> • Import from CSV (including RescueTime-style files); export JSON or CSV any time
>
> ■ PRIVATE BY DESIGN
> • No account, no analytics, no remote code, no third-party trackers; site icons are generated locally, so no domain you visit leaves your device
> • Old data is deleted automatically after a period you choose
>
> ■ FOR EVERYONE
> • Six languages with live switching: Hebrew, English, Arabic, Russian, Spanish, French (right-to-left supported)
> • Light and dark themes, keyboard shortcuts, keyboard and screen-reader accessibility, and a short first-run setup


**עברית**

> TimeTrack מראה לאן הזמן שלך באמת הולך — בגישה שמכבדת פרטיות ושומרת הכול מקומית. כל הנתונים נשארים במכשיר שלך; שום דבר לא נשלח לשום מקום, אלא אם תפעיל גיבוי שאתה שולט בו.
>
> ■ מעקב ותובנות
> • מדידה מדויקת של זמן פעיל: נספר רק זמן שבו החלון בפוקוס ואתה לא במצב חוסר פעילות (אפשר גם בזמן השמעת אודיו)
> • קטגוריות חכמות למאות אתרים פופולריים בכל אחת מהשפות הנתמכות, כולן ניתנות לעריכה, וגם ציון פוקוס 0–100 עם מגמה שבועית והשבוע הטוב ביותר שלך
> • מפת חום יום × שעה, תובנות בשפה פשוטה (גלישה בלילה, אתרים חדשים, השעה היצרנית ביותר שלך) והשוואה בין כל שני טווחי תאריכים
> • פירוט לכל אתר עם ציר זמן יומי ושעתי, ויומן ביקורים אופציונלי
> • לשונית אתרים שמותאמת להיסטוריה גדולה: חיפוש בהכול, הצמדת אתרים, מיזוג אתר ששינה שם, וסיווג, הגבלה או הסרה ממעקב של כמה אתרים בבת אחת
>
> ■ יעדים ופוקוס
> • יעדים יומיים ושבועיים, מגבלות לכל אתר ותקציבים שבועיים לקטגוריות ולתגיות שלך, עם התראות ב-80% וב-100%
> • מצב פוקוס (Pomodoro): חסימת אתרים מסיחים או רשימת היתר בלבד; סשנים מתוזמנים, מצב קפדני או הפסקה של 10 דקות
> • הישגים על רצפים, סשני פוקוס ועוד, שנשמרים במכשיר שלך בלבד
>
> ■ התאמה אישית
> • תגיות: קבץ אתרים בדרך שלך (עבודה, לימודים…) עם תצוגת זמן לפי תגית ותקציבים שבועיים
> • פלטת פקודות (Ctrl/Cmd+K): קפיצה לכל מסך או אתר, או הפעלת פעולה מהמקלדת
> • דוחות HTML שבועיים או חודשיים, שנשמרים בתיקייה שבחרת או מורדים לפי דרישה
>
> ■ גיבוי והנתונים שלך
> • גיבוי לחשבון Google שלך, לשרת HTTPS משלך, לשרת WebDAV עם היסטוריית גרסאות או לתיקייה במחשב, בתזמון ועם הצפנת AES-256 אופציונלית
> • אימות גיבוי בלי לשחזר אותו, תצוגה מקדימה לפני שחזור, שחזור של טווח תאריכים או של ההגדרות בלבד, והתראה כשהגיבוי מפסיק לעבוד
> • ייבוא מ-CSV (כולל קבצים בסגנון RescueTime) וייצוא JSON או CSV בכל עת
>
> ■ פרטיות מעיקרון
> • ללא חשבון, ללא אנליטיקס, ללא קוד מרוחק וללא מעקב צד-שלישי; סמלי האתרים נוצרים מקומית, כך שאף דומיין שאתה מבקר בו לא עוזב את המכשיר
> • נתונים ישנים נמחקים אוטומטית אחרי תקופה שתבחר
>
> ■ לכולם
> • שש שפות עם החלפה חיה: עברית, אנגלית, ערבית, רוסית, ספרדית, צרפתית (כולל כתיבה מימין לשמאל)
> • ערכות נושא בהיר וכהה, קיצורי מקלדת, נגישות למקלדת ולקוראי מסך, והתאמה ראשונית קצרה בהפעלה הראשונה


**العربية**

> يُظهر TimeTrack أين يذهب وقتك فعلًا — مع إعطاء الأولوية للخصوصية والتخزين المحلي. تبقى كل البيانات على جهازك، ولا يُرسل أي شيء إلى أي مكان ما لم تفعّل نسخًا احتياطيًا تتحكم به أنت.
>
> ■ التتبّع والرؤى
> • قياس دقيق للوقت الفعلي: يُحتسب فقط الوقت الذي تكون فيه النافذة في المقدمة وأنت غير خامل (واختياريًا أثناء تشغيل الصوت)
> • تصنيفات ذكية لمئات المواقع الشائعة بكل لغة مدعومة، وكلها قابلة للتعديل، مع درجة تركيز من 0 إلى 100 واتجاه أسبوعي وأفضل أسبوع لديك
> • خريطة حرارية للأيام × الساعات، ورؤى بلغة بسيطة (الاستخدام الليلي، المواقع الجديدة، ساعتك الأكثر إنتاجية) ومقارنة بين أي نطاقين زمنيين
> • تفاصيل لكل موقع مع مخططات زمنية يومية وبالساعة، وسجل زيارات اختياري
> • تبويب مواقع مصمم للسجلات الكبيرة: بحث في كل شيء، وتثبيت المواقع، ودمج موقع غيّر اسمه، وتصنيف عدة مواقع أو تقييدها أو إيقاف تتبّعها دفعة واحدة
>
> ■ الأهداف والتركيز
> • أهداف يومية وأسبوعية، وحدود لكل موقع، وميزانيات أسبوعية للتصنيفات ولوسومك الخاصة، مع تنبيهات عند 80% و100%
> • وضع التركيز (Pomodoro): احجب المواقع المشتّتة أو اسمح فقط بما تحتاجه؛ جدولة الجلسات، والوضع الصارم، أو استراحة لعشر دقائق
> • إنجازات للسلاسل المتتالية وجلسات التركيز وغيرها، تبقى على جهازك فقط
>
> ■ اجعله على طريقتك
> • الوسوم: جمّع المواقع بطريقتك (عمل، دراسة…) مع عرض الوقت حسب الوسم وميزانيات أسبوعية
> • لوحة الأوامر (Ctrl/Cmd+K): انتقل إلى أي شاشة أو موقع، أو نفّذ إجراءً من لوحة المفاتيح
> • تقارير HTML أسبوعية أو شهرية، تُحفظ في مجلد تختاره أو تُنزَّل عند الطلب
>
> ■ النسخ الاحتياطي وبياناتك
> • نسخ احتياطي إلى حساب Google أو إلى خادم HTTPS خاص بك أو إلى خادم WebDAV مع سجل إصدارات أو إلى مجلد على حاسوبك، بجدولة وتشفير AES-256 اختياري
> • تحقّق من نسخة احتياطية دون استعادتها، وعاين قبل الاستعادة، واستعد نطاق تواريخ فقط أو الإعدادات فقط، وتلقَّ تحذيرًا عند توقف النسخ الاحتياطي
> • استيراد من CSV (بما في ذلك ملفات بنمط RescueTime) وتصدير JSON أو CSV في أي وقت
>
> ■ الخصوصية بالتصميم
> • بلا حساب، وبلا تحليلات، وبلا شيفرة بعيدة، وبلا متتبّعات من أطراف ثالثة؛ تُنشأ أيقونات المواقع محليًا فلا يغادر جهازك أي نطاق تزوره
> • تُحذف البيانات القديمة تلقائيًا بعد المدة التي تختارها
>
> ■ للجميع
> • ست لغات مع تبديل فوري: العبرية والإنجليزية والعربية والروسية والإسبانية والفرنسية (مع دعم الكتابة من اليمين إلى اليسار)
> • سمتان فاتحة وداكنة، واختصارات لوحة المفاتيح، وإتاحة للوحة المفاتيح وقارئات الشاشة، وإعداد أولي قصير عند أول تشغيل


**Русский**

> TimeTrack показывает, куда на самом деле уходит ваше время — с упором на приватность и локальное хранение. Все данные остаются на вашем устройстве; ничто никуда не отправляется, пока вы сами не включите резервное копирование.
>
> ■ УЧЁТ И АНАЛИТИКА
> • Точный учёт активного времени: считается только время, когда окно в фокусе и вы не бездействуете (по желанию — и пока играет звук)
> • Умные категории для сотен популярных сайтов на всех поддерживаемых языках, все редактируются; плюс оценка фокуса 0–100 с недельным трендом и лучшей неделей
> • Тепловая карта «день недели × час», выводы простым языком (ночное использование, новые сайты, самый продуктивный час) и сравнение любых двух периодов
> • Подробности по каждому сайту с дневной и почасовой шкалой и необязательным журналом визитов
> • Вкладка «Сайты» для больших историй: поиск по всему, закрепление, объединение переименованного сайта, массовая категоризация, лимиты и исключение из учёта
>
> ■ ЦЕЛИ И ФОКУС
> • Дневные и недельные цели, лимиты на сайты, недельные бюджеты для категорий и ваших тегов, уведомления на 80% и 100%
> • Режим фокуса (Pomodoro): блокируйте отвлекающие сайты или разрешайте только нужные; сессии по расписанию, строгий режим или 10-минутный пропуск
> • Достижения за серии, сессии фокуса и не только — хранятся только на вашем устройстве
>
> ■ НАСТРОЙТЕ ПОД СЕБЯ
> • Теги: объединяйте сайты по-своему (Работа, Учёба…) с просмотром времени по тегам и недельными бюджетами
> • Палитра команд (Ctrl/Cmd+K): переход на любой экран или сайт и запуск действий с клавиатуры
> • Еженедельные или ежемесячные HTML-отчёты: в выбранную папку или скачиваются по запросу
>
> ■ РЕЗЕРВНЫЕ КОПИИ И ВАШИ ДАННЫЕ
> • Копии в аккаунт Google, на ваш HTTPS-сервер, на сервер WebDAV с историей версий или в папку на компьютере — по расписанию и с необязательным шифрованием AES-256
> • Проверка копии без восстановления, предпросмотр перед восстановлением, восстановление только диапазона дат или только настроек и предупреждение, когда копии перестают создаваться
> • Импорт из CSV (включая файлы в стиле RescueTime) и экспорт JSON или CSV в любой момент
>
> ■ ПРИВАТНОСТЬ ПО УМОЛЧАНИЮ
> • Без аккаунта, аналитики, удалённого кода и сторонних трекеров; значки сайтов создаются локально, поэтому ни один посещённый домен не покидает устройство
> • Старые данные удаляются автоматически через выбранный вами срок
>
> ■ ДЛЯ ВСЕХ
> • Шесть языков с мгновенным переключением: иврит, английский, арабский, русский, испанский, французский (поддерживается письмо справа налево)
> • Светлая и тёмная темы, горячие клавиши, доступность для клавиатуры и экранных дикторов и короткая первоначальная настройка


**Español**

> TimeTrack te muestra adónde va realmente tu tiempo, con la privacidad y el almacenamiento local por delante. Todo se queda en tu dispositivo; nada se envía a ningún sitio salvo que actives una copia de seguridad que tú controlas.
>
> ■ SEGUIMIENTO Y ANÁLISIS
> • Tiempo activo preciso: solo cuenta el tiempo con la ventana en primer plano y sin inactividad (opcionalmente también mientras suena audio)
> • Categorías inteligentes para cientos de sitios populares en cada idioma admitido, todas editables, y una puntuación de enfoque de 0 a 100 con tendencia semanal y tu mejor semana
> • Mapa de calor día × hora, ideas en lenguaje claro (uso nocturno, sitios nuevos, tu hora más productiva) y comparación de dos rangos de fechas cualesquiera
> • Detalle por sitio con líneas de tiempo diarias y por hora, y un registro de visitas opcional
> • Una pestaña de sitios pensada para historiales grandes: busca en todo, fija sitios, fusiona un sitio que cambió de nombre y categoriza, limita o deja de seguir varios a la vez
>
> ■ OBJETIVOS Y ENFOQUE
> • Objetivos diarios y semanales, límites por sitio y presupuestos semanales para categorías y para tus propias etiquetas, con avisos al 80 % y al 100 %
> • Modo concentración (Pomodoro): bloquea sitios que distraen o permite solo lo que necesitas; sesiones programadas, modo estricto o una pausa de 10 minutos
> • Logros por rachas, sesiones de enfoque y más, guardados solo en tu dispositivo
>
> ■ A TU MANERA
> • Etiquetas: agrupa sitios a tu modo (Trabajo, Estudios…) con vista de tiempo por etiqueta y presupuestos semanales
> • Paleta de comandos (Ctrl/Cmd+K): salta a cualquier pantalla o sitio, o ejecuta una acción desde el teclado
> • Informes HTML semanales o mensuales, guardados en la carpeta que elijas o descargados cuando quieras
>
> ■ COPIAS DE SEGURIDAD Y TUS DATOS
> • Copias a tu cuenta de Google, a tu propio servidor HTTPS, a un servidor WebDAV con historial de versiones o a una carpeta de tu equipo, programadas y con cifrado AES-256 opcional
> • Verifica una copia sin restaurarla, previsualiza antes de restaurar, restaura solo un rango de fechas o solo los ajustes y recibe un aviso si las copias dejan de funcionar
> • Importa desde CSV (incluidos archivos al estilo RescueTime) y exporta JSON o CSV cuando quieras
>
> ■ PRIVADO POR DISEÑO
> • Sin cuenta, sin analíticas, sin código remoto y sin rastreadores de terceros; los iconos de los sitios se generan en local, así que ningún dominio que visitas sale de tu dispositivo
> • Los datos antiguos se borran automáticamente tras el plazo que elijas
>
> ■ PARA TODOS
> • Seis idiomas con cambio en vivo: hebreo, inglés, árabe, ruso, español y francés (con escritura de derecha a izquierda)
> • Temas claro y oscuro, atajos de teclado, accesibilidad para teclado y lectores de pantalla y una breve configuración inicial


**Français**

> TimeTrack montre où va vraiment votre temps, en privilégiant la confidentialité et le stockage local. Tout reste sur votre appareil ; rien n'est envoyé nulle part sauf si vous activez une sauvegarde que vous contrôlez.
>
> ■ SUIVI ET ANALYSES
> • Temps actif précis : seul compte le temps où la fenêtre est au premier plan et où vous n'êtes pas inactif (en option, aussi pendant la lecture audio)
> • Catégories intelligentes pour des centaines de sites populaires dans chaque langue prise en charge, toutes modifiables, avec un score de concentration de 0 à 100, sa tendance hebdomadaire et votre meilleure semaine
> • Carte thermique jour × heure, analyses en langage clair (usage nocturne, nouveaux sites, votre heure la plus productive) et comparaison de deux plages de dates au choix
> • Détail par site avec chronologies quotidienne et horaire, et un journal de visites facultatif
> • Un onglet Sites conçu pour les gros historiques : recherche partout, épinglage, fusion d'un site renommé, et catégorisation, limite ou exclusion de plusieurs sites à la fois
>
> ■ OBJECTIFS ET CONCENTRATION
> • Objectifs quotidiens et hebdomadaires, limites par site et budgets hebdomadaires pour les catégories et pour vos propres tags, avec alertes à 80 % et 100 %
> • Mode concentration (Pomodoro) : bloquez les sites distrayants ou n'autorisez que l'essentiel ; sessions planifiées, mode strict ou pause de 10 minutes
> • Des réussites pour les séries, les sessions de concentration et plus, conservées uniquement sur votre appareil
>
> ■ À VOTRE FAÇON
> • Tags : regroupez les sites à votre manière (Travail, Études…) avec une vue du temps par tag et des budgets hebdomadaires
> • Palette de commandes (Ctrl/Cmd+K) : accédez à n'importe quel écran ou site, ou lancez une action au clavier
> • Rapports HTML hebdomadaires ou mensuels, enregistrés dans le dossier de votre choix ou téléchargés à la demande
>
> ■ SAUVEGARDE ET VOS DONNÉES
> • Sauvegardes vers votre compte Google, votre propre serveur HTTPS, un serveur WebDAV avec historique des versions ou un dossier de votre ordinateur, planifiées et avec chiffrement AES-256 facultatif
> • Vérifiez une sauvegarde sans la restaurer, prévisualisez avant de restaurer, restaurez seulement une plage de dates ou les réglages, et soyez averti quand les sauvegardes cessent de fonctionner
> • Import depuis CSV (y compris les fichiers de type RescueTime) et export JSON ou CSV à tout moment
>
> ■ CONFIDENTIEL PAR CONCEPTION
> • Pas de compte, pas d'analytique, pas de code distant, pas de traceurs tiers ; les icônes de sites sont générées localement, donc aucun domaine visité ne quitte votre appareil
> • Les anciennes données sont supprimées automatiquement après la durée que vous choisissez
>
> ■ POUR TOUS
> • Six langues avec changement en direct : hébreu, anglais, arabe, russe, espagnol, français (écriture de droite à gauche prise en charge)
> • Thèmes clair et sombre, raccourcis clavier, accessibilité au clavier et aux lecteurs d'écran, et une courte configuration au premier lancement

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

1.5.0, 1.6.0, 1.7.0 and 2.0.0 add **no new permissions** (enforced by `dist/tests/package.test.js`).

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
  target (Google sync, the user's own HTTPS endpoint, or the user's own WebDAV
  server), optionally AES-256 encrypted. Backups and exports never contain the
  passphrase, the endpoint token or the WebDAV password (the WebDAV user name and
  password stay on the device and are sent only to that server, to sign in). Backup files and summary
  reports can also be written into a folder the user picks on their own computer.
  The extension stores a random install ID (included in backups) and the date each
  achievement was reached; neither identifies the user.
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
- [x] `version` in `extension/manifest.json` is **1.7.0**; `CHANGELOG.md` and the
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
- [x] **1.6.0:** merged to `main` and uploaded to the Store (2026-10-24, per the owner). The
      `v1.6.0` tag and GitHub Release are still to do.
- [x] **1.7.0:** merged, tagged `v1.7.0` and uploaded to the Store.
- [ ] **2.0.0:** merge the release PR to `main`, push the tag `v2.0.0`, then upload that
      Release's `timetrack-v2.0.0.zip`. No new permissions. Data disclosures (section 4) and the
      privacy policy are updated for the new local data (tags, achievements, install ID) and the
      two optional destinations (a local folder, a WebDAV server). In the Store's Privacy practices tab
      the declared category stays *Web history*; paste each language's
      `listing-text/description-<lang>.txt` again and use the new screenshots.
- [ ] **1.6.0 listing:** in the dashboard's Store listing tab, set the default language to
      English, add Hebrew, Arabic, Russian, Spanish and French from the language dropdown, and
      paste each language's `listing-text/description-<lang>.txt` into its Description box.
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
