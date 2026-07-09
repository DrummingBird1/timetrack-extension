# Privacy Policy — TimeTrack / מדיניות פרטיות

**Effective date / תאריך תחילה:** 2026-06-25
**Contact / יצירת קשר:** via the project's GitHub repository — [open an issue](https://github.com/DrummingBird1/timetrack-extension/issues)

---

<div dir="rtl">

## עברית

TimeTrack הוא תוסף דפדפן למעקב אחר זמן הגלישה שלך. הפרטיות שלך היא עיקרון הליבה
של המוצר: **כל הנתונים נשמרים מקומית במכשיר שלך, ושום דבר לא נשלח לאף גורם** —
אלא אם תפעיל במפורש גיבוי שאתה שולט בו.

### אילו נתונים נאספים

התוסף מודד, באופן מקומי בלבד:

- **שם הדומיין** של האתר הפעיל (לדוגמה `youtube.com`) — **לא** את הכתובת המלאה,
  לא פרמטרים, ולא את תוכן הדף.
- **משך הזמן הפעיל** וכמות הביקורים לכל דומיין, מקובצים לפי יום ולפי שעה ביום.
- **ההגדרות שלך** (יעדים, מגבלות, קטגוריות, ערכת נושא וכו׳).

התוסף **אינו** אוסף: היסטוריית גלישה מלאה (URLs), תוכן דפים, כותרות, הקלדות,
סיסמאות, מיקום, או כל מזהה אישי.

### היכן הנתונים נשמרים

כל הנתונים נשמרים מקומית בלבד דרך `chrome.storage.local` בתוך הדפדפן שלך. אין
לנו שרת, אין לנו גישה לנתונים שלך, ואיננו מבצעים שום מעקב אנליטי. לתוסף אין קוד
חיצוני ולא מתבצעות קריאות רשת לא-רצוניות (גם האייקונים נוצרים מקומית).

### גיבוי בענן (אופציונלי, ביוזמתך בלבד)

אם תבחר להפעיל גיבוי, הנתונים יישלחו **אך ורק** ליעד שאתה מגדיר ושולט בו:

1. **חשבון Google שלך** דרך `chrome.storage.sync` — מנגנון הסנכרון המובנה של
   Chrome, המשויך לחשבון שלך. איננו צד בכך.
2. **שרת מותאם אישית** שכתובתו (HTTPS בלבד) אתה מספק — הנתונים נשלחים לשרת שלך.

ניתן להגדיר **הצפנת AES-256 עם סיסמה**; במצב זה הנתונים מוצפנים במכשיר שלך לפני
היציאה, והיעד רואה רק טקסט מוצפן. הסיסמה נשמרת מקומית בלבד ולעולם אינה נשלחת.

### שליטה ומחיקה

אתה שולט בכל הנתונים: ניתן לייצא (JSON/CSV), לייבא, להגדיר מחיקה אוטומטית של
נתונים ישנים, או למחוק את הכל בלחיצה מתוך מסך ההגדרות. הסרת התוסף מוחקת את כל
הנתונים המקומיים.

### הרשאות

`storage`/`unlimitedStorage` (שמירה מקומית), `tabs` (זיהוי דומיין הלשונית הפעילה
— ללא גישה לתוכן), `idle` (השהיית ספירה בחוסר פעילות), `alarms` (שמירה וגיבוי
תקופתיים), `notifications` (התראות מגבלה וסיכום). אין הרשאות host ואין content
scripts.

### שינויים וילדים

המוצר אינו מיועד לילדים מתחת לגיל 13 ואינו אוסף מהם נתונים ביודעין. עדכונים
למדיניות זו יפורסמו בעמוד זה עם תאריך תחילה מעודכן.

</div>

---

## English

TimeTrack is a browser extension that tracks how much time you spend on websites.
Privacy is the core principle of the product: **all data is stored locally on your
device, and nothing is sent anywhere** — unless you explicitly enable a backup
target that you control.

### What data is collected

Locally, and only locally, the extension measures:

- The **domain name** of the active site (e.g. `youtube.com`) — **not** the full
  URL, query parameters, or page content.
- **Active time** and visit counts per domain, bucketed by day and hour-of-day.
- **Your settings** (goals, limits, categories, theme, etc.).

The extension does **not** collect: full browsing history (URLs), page content,
titles, keystrokes, passwords, location, or any personal identifier.

### Where data is stored

All data lives locally via `chrome.storage.local` inside your browser. We operate
no server, have no access to your data, and run no analytics. The extension
contains no remote code and makes no involuntary network requests (even site
icons are generated locally).

### Cloud backup (optional, user-initiated only)

If you enable backup, data is sent **only** to a target you configure and control:

1. **Your Google account** via `chrome.storage.sync` — Chrome's built-in sync,
   tied to your account. We are not a party to it.
2. **A custom server** at an HTTPS URL you provide — data goes to your server.

You may enable **AES-256 passphrase encryption**; data is then encrypted on your
device before leaving, and the target sees only ciphertext. The passphrase is
stored locally and never transmitted.

### Control and deletion

You control all data: export (JSON/CSV), import, set automatic deletion of old
data, or erase everything from the Settings screen. Uninstalling the extension
deletes all local data.

### Permissions

`storage`/`unlimitedStorage` (local storage), `tabs` (read the active tab's domain
— no content access), `idle` (pause counting when inactive), `alarms` (periodic
save/backup), `notifications` (limit and summary alerts). No host permissions, no
content scripts.

### Changes & children

The product is not directed at children under 13 and does not knowingly collect
their data. Updates to this policy will be posted on this page with a revised
effective date.
