# Deployment (Vercel) and domain

The runbook for deploying the DAH site safely. Written without access to
the Vercel account. Anything that must be checked or changed in the
Vercel dashboard, the domain registrar or a third-party console is marked
**BLOCKED EXTERNAL STEP**.

## What runs where

| Piece | Service | Notes |
|---|---|---|
| Web app + API routes | Vercel (Next.js 16, Node runtime) | `npm run build` → `scripts/build.mjs` |
| Hourly cron | Vercel Cron → `GET /api/cron/notifications` | reminders, rate-limit cleanup, payment reconciliation; authenticated with `CRON_SECRET` |
| Database | Hosted Postgres (Vercel Postgres / Neon / Supabase) | pooled URL at runtime (`DATABASE_URL`), direct URL for migrations (`DIRECT_URL`) |
| File uploads | Vercel Blob (public store) | `PUBLIC_BLOB_*` |
| Email | Resend | sending domain DNS records at the registrar |
| WhatsApp (OTP + notifications) | Infobip | delivery-report webhook → `/api/webhooks/infobip-whatsapp?secret=…` |
| Health check | `GET /api/health` | `{ ok, database }`, 503 when the DB is unreachable; no config or secrets exposed |

## Environment variables

`lib/env.ts` is the source of truth. The app prints every missing variable
(names only) once at startup, and in production that goes to the Vercel
logs as an error. `.env.example` explains each one.

| Scope | Variables |
|---|---|
| Required everywhere | `DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET`, `ADMIN_PASSWORD` |
| Production | `NEXT_PUBLIC_SITE_URL`, `RESEND_API_KEY`, `RESEND_EMAIL_DOMAIN` (or `EMAIL_FROM`), `INFOBIP_WHATSAPP_*` (5), `PUBLIC_BLOB_READ_WRITE_TOKEN` or `PUBLIC_BLOB_STORE_ID`, `CRON_SECRET`, `INFOBIP_WEBHOOK_SECRET`, `RESEND_WEBHOOK_SECRET` |
| Optional | `ADMIN_NOTIFY_EMAIL`, `AGREEMENTS_SHEETS_WEBHOOK_URL`, `PAYMENT_PROVIDER`, `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET`, `ALLOW_SANDBOX_PAYMENTS`, `MIGRATE_ON_PREVIEW` |

Rules:
- **Never give Preview the production database** unless you accept that
  Preview deployments can read and write production data. Preferred: a
  separate Preview database (e.g. a Neon branch), with
  `MIGRATE_ON_PREVIEW=true` set for Preview only.
- `ALLOW_SANDBOX_PAYMENTS=true` only ever on Preview, and only with its
  own database. Never on Production (see `docs/PAYMENTS.md`).
- `AUTH_SECRET` and `ADMIN_PASSWORD` should differ between Production and
  Preview.
- Changing an env var needs a redeploy to take effect.

## Build and migrations

`npm run build` runs `scripts/build.mjs`:

| Build | `prisma migrate deploy`? |
|---|---|
| Vercel Production | yes, before `next build`; a failed migration fails the deploy, so the old version keeps serving |
| Vercel Preview / Development | **no**, unless `MIGRATE_ON_PREVIEW=true` |
| Local / CI (not Vercel) | yes |

Why: previously every Vercel build ran migrations. A Preview built from an
unmerged pull request would have applied that branch's migrations to
whatever database Preview points at. If that is production, the schema
changes before review, and possibly never gets merged.

Migration policy (see also Phase 15 in the progress doc):
- **Forward-only and additive** wherever possible (new nullable columns,
  new tables). Every migration so far in this modernisation has been
  additive.
- Never `prisma migrate reset`, `db push --force-reset` or a destructive
  seed against Production.
- A column or table removal happens in two deploys: first stop using it,
  then drop it later.

**BLOCKED EXTERNAL STEP:** confirm in Vercel → Settings → Build & Deployment
that the Build Command is not overridden. An override would bypass
`scripts/build.mjs`; it should be empty or `npm run build`.

## Runtime settings to confirm in Vercel (BLOCKED EXTERNAL STEP)

- **Node.js version:** 22.x, to match `.nvmrc` and local development.
  Next 16 and Prisma 7 both support it.
- **Function region:** the same region as, or closest to, the Postgres
  database. Every request makes several DB round trips, so a cross-region
  hop is paid many times per page.
- **Cron:** `vercel.json` schedules `/api/cron/notifications` hourly.
  Vercel's Hobby plan only allows daily cron jobs. On Hobby, the schedule
  must change to daily (reminders become less timely), or the project
  moves to Pro.
- **Deployment Protection** on Preview (Vercel Authentication) is worth
  enabling so previews aren't publicly reachable.
- **Instant Rollback:** Vercel can roll back to the previous deployment.
  Because migrations are additive, the previous code keeps working against
  the newer schema.

## Domain (BLOCKED EXTERNAL STEP: registrar / DNS access)

1. Vercel → Project → Settings → Domains: add the apex domain (e.g.
   `example.ae`) and `www.example.ae`. Choose one as primary; Vercel then
   308-redirects the other to it.
2. At the registrar, add exactly the records Vercel shows. Typically an
   `A` record for the apex and a `CNAME` for `www` → `cname.vercel-dns.com`.
3. Wait for Vercel to show both as "Valid Configuration". The certificate
   is issued automatically.
4. Set `NEXT_PUBLIC_SITE_URL=https://<primary domain>` for **Production**,
   then redeploy. It feeds email links, receipts, the sitemap, `robots.txt`,
   canonical URLs, the Google redirect URI and payment return URLs.
5. Update everything that references the domain:
   - Resend: add and verify the sending domain's DNS records (SPF, DKIM
     and optionally DMARC). Set `RESEND_EMAIL_DOMAIN`.
   - Resend webhook URL → `https://<domain>/api/webhooks/resend`.
   - Infobip delivery-report URL →
     `https://<domain>/api/webhooks/infobip-whatsapp?secret=<INFOBIP_WEBHOOK_SECRET>`.
   - Google OAuth (if enabled): authorised redirect URI
     `https://<domain>/api/auth/google/callback`.
   - A payment provider (when there is one): webhook
     `https://<domain>/api/webhooks/payments/<provider>`.
6. Security headers are already sent by `next.config.ts`: HSTS for two
   years with includeSubDomains, CSP, and frame, content-type and referrer
   policies. Don't add HSTS `preload` until every subdomain serves HTTPS.

## Search Console (BLOCKED EXTERNAL STEP: needs DAH's Google account)

1. Google Search Console → Add property → **Domain** property for the
   primary domain. Verify with the DNS TXT record Google shows, added at
   the registrar. This covers apex, www, http and https at once.
   (Alternative: a URL-prefix property with the "HTML tag" method. Put
   the token in `GOOGLE_SITE_VERIFICATION` and redeploy.)
2. Sitemaps → submit `https://<domain>/sitemap.xml`.
3. URL Inspection → test one event page. The Rich Results test should
   detect the schema.org **Event** markup.

What the site already does: canonical URLs on public pages, a sitemap
(pages, legal pages, published events), and robots rules. Private
vendor/admin pages are `noindex` and disallowed. Preview deployments are
entirely `noindex` and disallowed. Organization JSON-LD is on the home
page, Event JSON-LD on each event page, plus Open Graph/Twitter cards.

## Launch-day check

Once DNS is live:
- [ ] `GET https://<domain>/api/health` returns `{"ok":true,"database":"up"}`
- [ ] Vercel logs show no `[env] Missing in production` error at startup
- [ ] Register a test vendor: the welcome email arrives from the DAH domain
- [ ] Phone verification: the WhatsApp OTP arrives
- [ ] Admin login works; Admin → Settings → Active admin sessions lists it
- [ ] The cron's first hourly run succeeds (Vercel → Cron Jobs → logs)
- [ ] `https://<domain>/sitemap.xml` and `/robots.txt` use the real domain
- [ ] Online checkout shows "DAH will contact you" (payments offline) and
      Record offline payment works end to end
