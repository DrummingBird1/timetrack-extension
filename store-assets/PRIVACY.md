# Privacy Policy — TimeTrack

**Effective date:** 2026-11-15
**Contact:** via the project's GitHub repository — [open an issue](https://github.com/DrummingBird1/timetrack-extension/issues)
**Other languages:** [Hebrew](PRIVACY.he.md). The site shows the policy in all six interface languages.

---

TimeTrack is a browser extension that tracks how much time you spend on websites.
Privacy is the core principle of the product: **all data is stored locally on your
device, and nothing is sent anywhere** — unless you explicitly enable a backup
target that you control.

### What data is collected

Locally, and only locally, the extension measures:

- The **domain name** of the active site (e.g. `youtube.com`) — **not** the full
  URL, query parameters, or page content.
- **Active time** and visit counts per domain, bucketed by day and hour-of-day.
- **Session log (optional, off by default)** — if you turn it on: the start time and
  length of each visit to a site. It stays local and can be deleted at any time.
- **Focus-session history** — when each focus session started, how long it lasted and whether
  it was completed.
- **Your settings** (goals, limits, categories, theme, etc.).
- **Achievements and a device ID** — the date each milestone was first reached, and a random ID of this install that travels inside backups so a restore can tell devices apart. Neither identifies you.

The extension does **not** collect: full browsing history (URLs), page content,
titles, keystrokes, passwords, location, or any personal identifier.

### Where data is stored

All data lives locally via `chrome.storage.local` inside your browser. We operate
no server, have no access to your data, and run no analytics. The extension
contains no remote code and makes no involuntary network requests (even site
icons are generated locally).

If you choose a folder on your computer, backup files and summary reports are written there; they are ordinary files that you control.

### Cloud backup (optional, user-initiated only)

If you enable backup, data is sent **only** to a target you configure and control:

1. **Your Google account** via `chrome.storage.sync` — Chrome's built-in sync,
   tied to your account. We are not a party to it.
2. **A custom server** at an HTTPS URL you provide — data goes to your server.
3. **A WebDAV server** at an HTTPS address you provide — each backup is a new file there, so earlier ones are kept; data goes to your server. The user name and password are stored only on this device and sent only to that server to sign in; they are never part of a backup.

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
