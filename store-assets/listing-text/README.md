# Store listing text

One plain-text file per language, ready to copy into the Chrome Web Store dashboard:
**Store listing → pick the language in the dropdown → Description**. Open the file, select
all, copy, paste.

| File | Language |
|------|----------|
| `description-en.txt` | English (the default language) |
| `description-he.txt` | עברית |
| `description-ar.txt` | العربية |
| `description-ru.txt` | Русский |
| `description-es.txt` | Español |
| `description-fr.txt` | Français |

Only the long description is pasted by hand. The title and the short summary come from the
package itself (`extension/_locales/<lang>/messages.json`), and the screenshots are in
`../screenshots/` (`he/` for Hebrew, `en/` for the others).

These files are generated from the "Detailed description" section of `../STORE_LISTING.md`.
Edit the text there, then run `node dist/tools/listing-text.mjs`. `docs.test.js` fails when the
files here are out of date.
