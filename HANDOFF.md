# Common AI — Project Handoff

_A quick, plain-English guide so a new session can pick up fast._

---

## 1. What this project is

**Common AI** is a platform that **auto-fills the Common Application** (the U.S. college application at `apply.commonapp.org`) from a student's saved profile. Target users: **students from Kazakhstan** (and agencies helping them).

It has three pieces:

1. **Web app** (`apps/web`) — Next.js 14 + Prisma + Supabase Postgres. Students fill in their info here (profile, family, education, testing, activities, essays, courses & grades). Also billing ($5/application), 3 roles (Individual / Agency / Admin), AI essay help.
2. **Chrome extension** (`apps/extension`) — reads the saved profile from the web app and **types it into the live Common App** in the browser. This is where most of the hard work / bugs live.
3. **Field maps** (`packages/field-maps/templates/commonapp.json`) — a big JSON that maps _our data fields_ → _Common App form fields_ (CSS selectors, question IDs, how to fill each one).

---

## 2. The goal

A student fills their info **once** in Common AI, clicks **one button** in the extension, and their entire Common App is filled and saved — every section, every page — ready to review and submit. No manual copy-paste.

---

## 3. How the autofill actually works (data flow)

```
Web app (student data) ──► Postgres (Prisma)
        │
        ▼
apps/web/src/app/api/extension/profile   ← extension fetches the student's data (JSON)
apps/web/src/app/api/extension/fieldmap  ← extension fetches the field map for that university
        │
        ▼
Chrome extension
  background.js  = service worker. Holds the token, fetches data, drives page-to-page
                   navigation ("Autofill + Save all pages"), and (new) the trusted-event bridge.
  content.js     = runs inside the Common App page. Does the actual filling: finds each
                   field from the field map and sets its value. THE ENGINE.
  popup.html/js  = the little settings window (Backend URL, token, Application ID, buttons).
```

**Common App is an Angular single-page app.** Its form controls are custom Angular components (`mat-select`, `ng-select`, radios wrapped in `CA-CONTROL-WRAPPER`, etc.). You can't just set `input.value` — you have to open dropdowns, click the right option, and trigger the events Angular listens for. That's why `content.js` is complex.

**Config the extension needs (in the popup):**
- Backend URL → `https://common-ai-web.vercel.app` (NOT `localhost:3000`)
- Access token → from dashboard → Extension tab
- Application ID → from dashboard → Overview (must be a **paid/unlocked** application)

---

## 4. What's DONE and working ✅

**Courses & Grades (transcript) — fully working.** Grades 9–12, all 18 Kazakhstan courses each, grades 5.0 (scale 0.0–5.0), Quarters schedule, N/A credits. Verified live: all four grades save on Common App.

Key fixes that made it work (already committed):
- **Backdrop purge** — Common App's modal dropdowns don't auto-close; they leave invisible full-screen layers (`cdk-overlay-transparent-backdrop`) that swallow clicks. `content.js` now removes them after every dropdown → "Add another course" and "Continue" work.
- **School Name desync fix** — open the dropdown once and pick, don't pre-call a failing match.
- **12th-grade gate** — 12th grade has a required "Do you have official grades?" Yes/No question that silently discards the transcript if unanswered. `content.js` now answers "Yes" first.
- **Version tag in popup** — the popup header shows the build version (e.g. `v0.3.1`) so you can confirm a reinstall actually took.

**Other working sections:** Profile, Family, most of Education, Activities, Honors, Writing/essays (needs a real `ANTHROPIC_API_KEY` in Vercel for AI features).

---

## 5. THE CURRENT PROBLEM ❌ (this is what to fix next)

**The Testing section does NOT sync — IELTS and SAT scores are not filling on Common App.**

### Root cause (confirmed, not a guess)
The Common App **"Tests Taken" page (`/common/2/2`)** has a multi-select ("Indicate all tests you wish to report") built with **`ng-select` wrapped in Common App's own `CA-CONTROL-WRAPPER` / `CA-MULTI-SELECT-DROPDOWN` component**. This wrapper **ignores synthetic events** — it checks `event.isTrusted`, and any click JavaScript dispatches has `isTrusted === false`, so Angular ignores it.

**Consequence:** the extension can't reliably add test types (SAT / ACT / **IELTS** / SAT Subject) to that multi-select. And because the **IELTS and SAT score sub-sections only appear AFTER their test type is selected in that multi-select**, if the test type isn't added, the score fields never render → scores can't be filled at all. That's why "even the SAT scores are not syncing."

### What was tried (in-progress, **uncommitted**)
A **trusted-event bridge** using the `chrome.debugger` API (Chrome DevTools Protocol). The `debugger` permission lets the extension dispatch **real, trusted** mouse/keyboard events via `Input.dispatchMouseEvent` / `Input.insertText`. Chrome shows a "Common AI has started debugging this browser" banner while active.

- `background.js` — added `attachDebugger` / `trustedClickAt` / `trustedKey` / `trustedType` + message handlers `TRUSTED_CLICK` / `TRUSTED_KEY` / `TRUSTED_TYPE` / `TRUSTED_RELEASE`.
- `content.js` — added `trustedClickEl` etc. and rewired the `multi-combobox` handler to use trusted clicks; also fixed dropdown-panel detection (`ng-dropdown-panel` has `offsetParent === null` even when open → now detect via `getComputedStyle(...).display !== "none"`).

**Status: still NOT working as of the last test.** Manual JS injection into the page DID successfully add IELTS + SAT Subject to the chips, but the extension's own run still fails. Needs live debugging.

### Where to look / how to debug next
1. Load the extension unpacked, open Common App `/common/2/2`, open DevTools console.
2. Run "Autofill this page only" and watch for `[CommonAI]` warnings from `trustedClickEl` (it logs failures).
3. Verify the `debugger` bridge actually attaches (the Chrome banner should appear). If not, the `TRUSTED_*` messages aren't reaching `background.js`, or `_sender.tab.id` is missing.
4. Confirm the trusted click lands on the right coordinates — the dropdown panel is absolutely positioned and may be off-viewport after scroll (there's RAF + off-screen guards in `trustedClickEl`, verify they're correct).
5. Once test types are in the multi-select, confirm the IELTS/SAT score sub-sections render, THEN check those score fields fill (they use `mat-select` / `combo-pick`, mapped in the field map).

**Relevant field-map entries:** `packages/field-maps/templates/commonapp.json` — pages `2/2` (tests taken + multi-select `#text_ques_11`), `2/3` (ACT), `2/236` (SAT), `2/10`/`2/37` (IELTS etc.). Source keys are under `testScores.*`.

**Relevant data:** `TestScores` model in `apps/web/prisma/schema.prisma` (all `ielts*`, `sat*`, `act*`, `testsToReport` CSV). Served by `apps/web/src/app/api/extension/profile/route.ts` as `testScores`.

---

## 6. File map (where things are)

| Path | What |
|---|---|
| `apps/extension/content.js` | **The autofill engine.** All fill logic (dropdowns, radios, courses grid, multi-combobox, trusted events). Most bugs live here. |
| `apps/extension/background.js` | Service worker: auth, fetch data, page-to-page driver (`RUN_ALL_PAGES`), trusted-event bridge (`chrome.debugger`). |
| `apps/extension/popup.html` / `popup.js` | Settings popup + buttons + version tag. |
| `apps/extension/manifest.json` | MV3 manifest. Current version + permissions (now includes `debugger`). |
| `packages/field-maps/templates/commonapp.json` | Field map: our data → Common App fields. |
| `apps/web/src/app/api/extension/profile/route.ts` | Serves the student's data to the extension. |
| `apps/web/src/app/api/extension/fieldmap/route.ts` | Serves the field map. |
| `apps/web/src/app/dashboard/*` | The data-entry UI (testing, grades, profile, family, …). |
| `apps/web/prisma/schema.prisma` | Database schema (Applicant, TestScores, GradeReport, etc.). |
| `apps/web/scripts/zip-extension.cjs` | Builds the downloadable extension zip (pure Node). |

---

## 7. Important workflow rules

- **The downloadable zip must always be up to date.** Any change under `apps/extension/` → run `node apps/web/scripts/zip-extension.cjs` and commit `apps/web/public/common-ai-extension.zip`. (A PostToolUse hook + the Vercel prebuild also regenerate it.)
- **The extension only reaches the user through that zip.** A page refresh does nothing; the user must **re-download + reinstall** (remove old card in `chrome://extensions`, Load unpacked the fresh folder). Confirm via the **version number in the popup header**.
- **Filling is slow** (~3–8 min per grade) because Common App re-renders its Angular grid on every entry. That's expected.

---

## 8. Current git / version state

- **Branch:** `main`
- **Latest commit:** `1b12c63` — "Fix multi-combobox finding ng-dropdown-panel (v0.3.1)"
- **Uncommitted work in progress:** `apps/extension/background.js`, `apps/extension/content.js`, and the zip — the trusted-event / dropdown-detection tweaks for the Testing fix. **These are NOT finished and the Testing sync still fails.**
- **Manifest version:** `0.3.1`

**First thing next session:** decide whether to keep iterating on the uncommitted Testing fix or `git stash`/reset and re-approach. The trusted-event (chrome.debugger) direction is sound — the blocker is making the extension's own run land the trusted clicks on the ng-select the way manual injection already proved works.

---

## 9. Known smaller issues (backlog)

- `didGraduate` maps to the wrong radio (question `1491` = "Do you live on campus?"; correct is `1834`). Needs remapping in the field map.
- Sibling **Age** field is unmapped.
- AI essay features need a real `ANTHROPIC_API_KEY` set in Vercel (currently a placeholder → 401).
- "Other Courses" page (`13/59`) support was added recently — verify it still works.
