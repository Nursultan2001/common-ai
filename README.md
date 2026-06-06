# United Agents

AI-assisted college application platform. **The AI prepares; the student reviews and submits.**
Pay-per-application ($5), with discounted pricing for agencies/counselors.

> ⚠️ **Read `docs/GUARANTEES.md` before building further.** Some things must never
> be built (auto-submitting on a student's behalf, generating recommendation
> letters, ghost-writing essays submitted under the student's authorship
> attestation). Those cross legal/integrity lines and get admissions rescinded.
> This codebase is deliberately designed around a *review-required* model.

## What's in this repo

```
united-agents/
├─ apps/
│  ├─ web/          Next.js app: intake, AI service, Stripe billing, admin
│  └─ extension/    Chrome MV3 extension: autofill + review-and-submit gate
├─ packages/
│  └─ field-maps/   Per-portal DOM mapping templates (the engineering moat)
```

### Core design principles (enforced in code)

1. **Single source of truth.** `MasterProfile` + activities/honors/essays/documents
   are the only facts the system uses. The AI prompts (`apps/web/src/lib/ai.ts`)
   forbid inventing any value and return a `missing[]` list instead of guessing.
2. **Review required.** AI output is a *draft* (`status: DRAFTED`). Only
   student-`APPROVED` content is ever exposed to autofill
   (`/api/extension/profile`). The extension highlights every field and blocks
   the portal's submit button until the student confirms (`content.js`).
3. **Server-enforced paywall = piracy protection.** The valuable logic (AI,
   field maps, profile data) lives server-side and is gated per-use by a `PAID`
   `Entitlement`. The installable extension is a thin client that's useless
   without a paid, authenticated session. No client-side "encryption" needed.
4. **Tamper-proof pricing.** Discounts resolve from the applicant's org
   server-side (`lib/pricing.ts` + `lib/entitlements.ts`); the client can't set
   its own price.

## Setup

Local dev uses **SQLite** — no database server needed. Env lives in
`apps/web/.env` (Prisma and Next both read it there, NOT the repo root).

```bash
npm install

# create apps/web/.env with real secrets:
cd apps/web
cp ../../.env.example .env
# then set AUTH_SECRET and DOC_ENCRYPTION_KEY (each: openssl rand -base64 32).
# DATABASE_URL="file:./dev.db" works as-is. STRIPE_*/ANTHROPIC optional for now.
cd ../..

npm run db:push --workspace=apps/web
npm run db:seed --workspace=apps/web   # creates student@demo.test / password123
npm run dev                            # http://localhost:3000  (admin at /admin)
```

> Production: switch the Prisma `datasource` provider in
> `apps/web/prisma/schema.prisma` from `sqlite` to `postgresql` and point
> `DATABASE_URL` at Postgres. (SQLite is dev-only; the schema uses String fields
> instead of native enums so the same models work on both.)

### Load the extension

1. Chrome → `chrome://extensions` → enable Developer mode → **Load unpacked** →
   select `apps/extension/`.
2. Click the extension, paste the **token** and **applicationId** the seed
   printed, Save.
3. The seeded application is **LOCKED**. Either run the Stripe checkout flow, or
   for local testing flip its entitlement to `PAID` in `npm run db:studio`.
4. Open a Common App page → popup → **Prepare autofill** → review highlights →
   you submit.

## Money flow ($5 / application, agency discounts)

`POST /api/stripe/checkout {applicationId}` → resolves org discount → Stripe
Checkout → webhook `checkout.session.completed` flips the `Entitlement` to
`PAID` → extension's `/api/extension/profile` now returns data (was `402`).
`charge.refunded` flips it back to `REFUNDED` (re-locks autofill).

## Status — what's wired vs. what's next

**Wired now:** data model; AI activities/honors polishing + essay-coaching
scaffold (anti-fabrication guardrails); Stripe per-application checkout + webhook
+ refund re-lock; agency discounts; entitlement gate; extension autofill engine
with submit-gate; field-map template + server delivery; admin KPIs/audit log.

**Next (intentionally not faked):**
- Real auth (replace the bearer-token stub in `lib/auth.ts` with Auth.js/JWT).
- Intake questionnaire UI + activities/honors/essay review screens.
- Document vault upload/download routes (crypto helper is ready in `lib/crypto.ts`).
- Admin field-map editor + per-field autofill success metrics.
- University supplement templates (the long tail — grow one school at a time).
- Verify Common App selectors against the live DOM (current ones are placeholders).

See `docs/ROADMAP.md` for the build order.
