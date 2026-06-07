# Making autofill work on the real Common App

The autofill engine is done. The only per-portal work is mapping each page's
fields to selectors. Common App is a React app with **auto-generated class names
that change**, so we never rely on those. Instead we match by stable things:
visible label text, the `name` attribute, or `aria-label`.

You capture these from the live, logged-in page — no guessing.

## One-time: load the extension
1. Chrome → `chrome://extensions` → Developer mode ON → **Load unpacked** →
   select `apps/extension/` (reload it if already loaded — it changed).

## Capture a page (~30 seconds per page)
1. Log in to https://apply.commonapp.org and open a section (e.g. Profile).
2. Click the extension → **Capture fields (build a map)**.
3. It downloads `commonapp-capture.json` and also prints a table in the page's
   DevTools console. Each row = one field on that page:
   `{ label, source, selector, kind }`.
4. The tool guesses `source` (e.g. `profile.legalFirstName`) from the label.
   Fix any blanks/wrong guesses — `source` must be a real path from the autofill
   payload (see the keys in `/api/extension/profile`).

## Save it into the template
1. Open `packages/field-maps/templates/commonapp.json`.
2. Find the page whose `urlPattern` matches the page you captured (or add a new
   page entry; set `urlPattern` to the captured page's URL with a trailing `*`).
3. Replace that page's `fields` with the captured ones. Keep `_label` or drop it
   (it's ignored at runtime). Example field:
   ```json
   { "source": "profile.legalFirstName",
     "selectors": ["label:First name", "name:legalFirstName"],
     "kind": "text" }
   ```
4. Bump the template `version`. Commit, push — Vercel redeploys and the new map
   is served to every extension instantly (maps live server-side).

## Verify
1. On the same page, click **Prepare autofill on this page**.
2. Fields fill and highlight; a review banner appears. Anything not filled shows
   up in the console table as `field-not-found` → fix that selector and repeat.

## Notes
- Repeating sections (Activities, Honors) use `rowSelector` + an optional
  `addButtonSelector`; capture those selectors the same way from the row markup.
- Respect Common App's Terms: this assists *you* in *your own* logged-in session
  and never auto-submits — you review and submit. Don't run it as an unattended
  bot.
- Selectors drift when Common App ships UI changes. Re-capture a page if a field
  starts showing `field-not-found`.
