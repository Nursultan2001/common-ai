# Overnight deep-scrape — status & how to finish (2026-06-09)

## Goal
Inventory EVERY fillable control on every Common App page (text boxes, dropdowns
+ their options, radio groups, checkbox lists) so the field map can cover all of
them with verified, stable selectors.

## What got built tonight (ready to use)
1. **Deep-scrape engine in the extension** (`apps/extension/content.js`):
   read-only inventory of a page — labels, stable ids (`text_ques_*` /
   `option_ques_*`), nearest stable anchors for unstable widgets, dropdown
   options (overlay opened → options read → closed with Escape), radio/checkbox
   groups with option labels + input ids. Never changes form values; never
   records what the user typed (only `hasValue: true/false`).
2. **One-click "Deep scrape ALL pages → file"** button in the extension popup:
   walks all 32 known Common App pages and downloads
   `commonapp-deep-scrape.json` at the end.
3. **Standalone scraper** (`apps/extension/deepscrape-standalone.js`) — same
   logic, runnable via Claude-in-Chrome `javascript_tool` or pasted in DevTools.

## Why it didn't run autonomously tonight
- Claude-in-Chrome extension never finished pairing (`list_connected_browsers`
  stayed empty).
- Control-Chrome (AppleScript) could list/navigate tabs but Chrome's
  "Allow JavaScript from Apple Events" is off, so it can't read pages. That's a
  browser security setting — deliberately NOT changed without the user present.

## Morning path A (fastest, ~3 min, no Claude needed)
1. `chrome://extensions` → reload **Common AI** extension.
2. Open any Common App page (logged in) → extension popup →
   **Deep scrape ALL pages → file**. Keep the tab open ~2 min.
3. It downloads `commonapp-deep-scrape.json`. Tell Claude — it gets read from
   `~/Downloads` and the field map gets rebuilt (v11) with every verified
   selector + dropdown valueMaps.

## Morning path B (lets Claude drive everything)
Finish connecting the **Claude in Chrome** extension (click it → sign in →
allow this site), keep a logged-in Common App tab open, then tell Claude "chrome
is connected" — it will walk and scrape all pages itself.

## After the scrape file exists (Claude's job)
- Rebuild `packages/field-maps/templates/commonapp.json` v11: every control
  mapped, dropdown option lists turned into valueMaps, radio/checkbox groups on
  verified `option_ques_*` ids or `within:`/`nth:` anchors.
- List every field the intake doesn't collect yet → expand profile sections.
