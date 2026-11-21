# Store listing text

One plain-text file per language, ready to copy into the Chrome Web Store dashboard:
**Store listing → pick the language in the dropdown → Description**. Open the file, select
all, copy, paste.

| File | Language | Source |
|------|----------|--------|
| `description-en.txt` | English (the default language) | generated from `../STORE_LISTING.md` |
| `description-he.txt` | Hebrew | edited by hand |
| `description-ar.txt` | Arabic | edited by hand |
| `description-ru.txt` | Russian | edited by hand |
| `description-es.txt` | Spanish | edited by hand |
| `description-fr.txt` | French | edited by hand |

Only the long description is pasted by hand. The title and the short summary come from the
package itself (`extension/_locales/<lang>/messages.json`), and the screenshots are in
`../screenshots/` (`he/` for Hebrew, `en/` for the others).

English is the primary text: it is written in the "Detailed description" section of `../STORE_LISTING.md`,
and `node dist/tools/listing-text.mjs` turns it into `description-en.txt`. The other five files follow the
same structure (an intro, then the same titled `■` sections with `•` bullets); `dist/tests/docs.test.js`
checks that, and that `description-en.txt` is not stale.
