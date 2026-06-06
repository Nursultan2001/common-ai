# Deploying Common AI

Target: **Vercel** (hosting) + **Supabase** (PostgreSQL). Both have free tiers
and need no servers to manage. This deploys the full app; the public sees the
waitlist landing page, and `/login` + `/admin` stay private.

> Neon works identically — just use its connection string for both URLs below.

---

## 1. Create the database (Supabase) — ~3 min

1. Sign up at https://supabase.com and create a project (set a DB password).
2. Go to **Project Settings → Database → Connection string**. You need two:
   - **Pooled** (Transaction mode, port **6543**) → this is `DATABASE_URL`.
     Append `?pgbouncer=true&connection_limit=1`.
   - **Direct** (port **5432**) → this is `DIRECT_URL`.
3. Put both in `apps/web/.env`, then push the schema + seed:

```bash
cd "apps/web"
# edit .env: set DATABASE_URL (pooled, 6543) and DIRECT_URL (direct, 5432)
npx prisma db push          # creates all tables (uses DIRECT_URL)
npm run db:seed             # demo data (optional)
npm run make-admin          # your free admin account (optional)
```

> Why two URLs: the app runs on serverless and must use Supabase's pooler, but
> Prisma migrations need a direct connection. Both point at the same database.

## 2. Push the code to GitHub

```bash
# from the repo root
git init
git add -A
git commit -m "Common AI: waitlist + app"
# create an empty repo on github.com, then:
git remote add origin https://github.com/<you>/common-ai.git
git branch -M main
git push -u origin main
```

(`.env` files are gitignored — your secrets are NOT committed.)

## 3. Import on Vercel — ~5 min

1. Go to https://vercel.com → **Add New… → Project** → import your GitHub repo.
2. **Root Directory:** set to `apps/web` (important — this is a monorepo).
   Vercel auto-detects Next.js and the npm workspace.
3. **Environment Variables** — add these (Production + Preview):

   | Key | Value |
   |-----|-------|
   | `DATABASE_URL` | Supabase **pooled** string (port 6543, `?pgbouncer=true&connection_limit=1`) |
   | `DIRECT_URL` | Supabase **direct** string (port 5432) |
   | `AUTH_SECRET` | run `openssl rand -base64 32` |
   | `APP_URL` | your Vercel URL, e.g. `https://common-ai.vercel.app` |
   | `DOC_ENCRYPTION_KEY` | run `openssl rand -base64 32` |

   Optional (enable later): `ANTHROPIC_API_KEY`, `AI_MODEL`,
   `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
   `STRIPE_PRICE_PER_APPLICATION_CENTS`, `ALLOWED_EXTENSION_ORIGIN`.

4. Click **Deploy**. Done — your waitlist is live.

### Alternative: Vercel CLI (no GitHub)
```bash
cd "apps/web"
vercel            # first run: links project, asks questions
vercel --prod     # production deploy
```
Add the same env vars with `vercel env add <KEY> production`.

## 4. After deploy

- Set `APP_URL` to the real domain so Stripe redirects + invite links are correct.
- Re-run `make-admin` against Neon if you want the admin account in prod.
- Add a custom domain in Vercel → Settings → Domains.

---

## What works vs. what needs more setup in production

| Feature | Status on Vercel |
|---|---|
| Waitlist landing (3 languages) | ✅ works |
| Admin + bulk invite | ✅ works |
| Auth (login/signup via invite) | ✅ works |
| AI polishing | needs `ANTHROPIC_API_KEY` |
| $5 checkout | needs `STRIPE_*` + webhook endpoint |
| **Document vault** | ⚠️ needs S3/R2 — local-disk storage won't persist on serverless. Swap `apps/web/src/lib/storage.ts` for an S3 client before enabling uploads in prod. |
| Browser extension | unaffected (installed in Chrome; set its Backend URL to your domain) |

## Notes
- Prisma client is generated on every build (`postinstall` + `build` scripts), so
  Vercel always has the correct engine.
- Migrations: this uses `prisma db push` (no migration history). For a stricter
  prod workflow later, switch to `prisma migrate`.
