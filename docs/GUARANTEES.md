# Product guarantees & hard lines

These are not style preferences. They are what keeps the business alive and your
customers' admissions intact. The architecture enforces them; do not "optimize"
them away.

## Never build these

1. **Auto-submitting an application.** The applicant must be the one who attests
   and clicks submit. The extension fills and highlights; the student submits.
   (`content.js` actively blocks portal submit buttons until the student
   confirms review.)
2. **Generating recommendation letters.** Recommendations are submitted by the
   teacher/counselor through their own verified link, under an integrity
   attestation that *they* wrote it. Producing these is forgery and gets offers
   rescinded. Allowed alternative: help the student prepare a *brag sheet* to
   give their real recommender.
3. **Ghost-writing essays submitted as the student's own.** Schools require an
   authorship attestation. Our essay flow is **coaching**: AI drafts a scaffold
   from the student's real notes; the student rewrites in their own voice; only
   the student's `finalText` is ever exposed to autofill.
4. **Inventing values.** The AI may only use facts the student provided and must
   report gaps (`missing[]`) rather than guess. Autofill only uses stored,
   approved data.

## Always do these

- Resolve price/discounts **server-side** (never trust the client).
- Gate every valuable operation behind a `PAID` entitlement, server-side.
- Keep the field-map library and AI prompts **server-side** (not in the shipped
  extension).
- Log AI generations and autofill events to the audit trail.
- Treat ToS: assist the logged-in user in their own session; do not run
  server-side bots that log into Common App and submit on users' behalf.
