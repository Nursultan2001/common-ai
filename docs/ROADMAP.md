# Build order

Done = scaffolded in this repo. Order below is the recommended path to a sellable v1.

## Phase 0 — foundation (DONE)
- [x] Monorepo, data model, server libs (db, ai, pricing, entitlements, crypto, auth-stub)
- [x] AI activities/honors polishing + essay-coaching scaffold (anti-fabrication)
- [x] Stripe per-application checkout + webhook + refund re-lock + agency discounts
- [x] Entitlement gate + extension autofill engine + submit gate
- [x] Field-map template (Common App core) + server delivery + admin KPIs/audit

## Phase 1 — make it usable by a real student (DONE)
- [x] Real auth: signed-JWT sessions (HttpOnly cookie + extension bearer token),
      bcrypt passwords, signup/login/logout, `/admin` gated to ADMIN.
- [x] Intake questionnaire UI writing to `MasterProfile`.
- [x] Activities/honors editor with "Polish with AI" → edit → approve → `APPROVED`.
- [x] Dashboard: applications list, per-uni unlock button → Stripe checkout
      (+ dev-unlock for local testing).
- [ ] Essay coaching UI (interview → outline → draft → student writes `finalText`).
      (Backend `draftEssayScaffold` exists; UI still to build.)

## Phase 2 — documents
- [x] Upload action (encrypt via `lib/crypto.ts`) + pluggable object storage
      (`lib/storage.ts`, local vault now / S3 later).
- [x] Download route (owner-only, decrypt on the fly).
- [ ] Extension `file_upload` auto-attach: map portal "upload" prompts →
      document type → vault file.

## Phase 3 — coverage & quality
- [x] Resilient selector strategies (label/name/aria) + in-extension "Capture
      fields" tool that generates a field map from a live page
      (see docs/COMMONAPP-SELECTORS.md).
- [ ] Run a real capture pass on each live Common App page → paste verified
      selectors into commonapp.json (needs a logged-in Common App account).
- [ ] Admin field-map editor; capture LLM-fallback mappings → human review → save.
- [ ] Per-field autofill success metrics; portal kill-switch on site changes.
- [ ] Add top university supplement templates one at a time.

## Phase 4 — agency growth
- [ ] Agency dashboard: manage many applicants, bulk credits, invoicing.
- [ ] Credit packs (buy N unlocks up front at the discounted rate).
- [ ] Outcomes feedback loop (with consent) to improve prompts/templates.
