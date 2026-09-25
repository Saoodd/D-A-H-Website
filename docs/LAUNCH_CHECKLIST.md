# Production launch checklist

Work through this before (and on) launch day. ✅ = already done in the
code. ☐ = a person has to do or confirm it, usually in a dashboard this
repo can't reach. Details live in the linked docs; this page is the list.

Related: [DEPLOYMENT.md](DEPLOYMENT.md) · [PAYMENTS.md](PAYMENTS.md) ·
[DATABASE.md](DATABASE.md) · [SECURITY_AUDIT.md](SECURITY_AUDIT.md) ·
[DATA_FETCHING.md](DATA_FETCHING.md)

---

## 1. Production environment variables (Vercel → Settings → Environment Variables → Production)

On every boot the server logs which variables are missing and what that
breaks (names only, never values; `lib/env.ts`, `instrumentation.ts`).
After deploying, check the Vercel runtime log for `[env]` lines.

| Variable | Needed for | ☐ Set |
|---|---|---|
| `DATABASE_URL` (pooled), `DIRECT_URL` (direct) | everything / migrations | ☐ |
| `AUTH_SECRET` (`openssl rand -base64 32`, unique to production) | logins, OTP hashing, OAuth cookie | ☐ |
| `ADMIN_PASSWORD` (long, unique) | admin login | ☐ |
| `NEXT_PUBLIC_SITE_URL` = `https://<real domain>` (no trailing slash) | links in emails, sitemap, canonicals, OAuth callback | ☐ |
| `RESEND_API_KEY`, `RESEND_EMAIL_DOMAIN`, `RESEND_WEBHOOK_SECRET` | email + delivery status | ☐ |
| `INFOBIP_WHATSAPP_BASE_URL`, `_API_KEY`, `_SENDER`, `_AUTH_TEMPLATE`, `_AUTH_TEMPLATE_LANGUAGE`, `INFOBIP_WEBHOOK_SECRET` | WhatsApp OTP (vendors can't apply without it), messages, delivery status | ☐ |
| `PUBLIC_BLOB_READ_WRITE_TOKEN`, `PUBLIC_BLOB_STORE_ID` | public images | ☐ |
| `CRON_SECRET` | hourly reminders / reconciliation | ☐ |
| `ADMIN_NOTIFY_EMAIL` (optional) | admin alerts | ☐ |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (optional) | "Continue with Google" | ☐ |
| `GOOGLE_SITE_VERIFICATION` (optional) | Search Console meta-tag method | ☐ |
| `PAYMENT_PROVIDER` + provider secrets | only once a real provider is integrated (§4) | ☐ |

- ☐ **Must NOT be set in Production:** `ALLOW_SANDBOX_PAYMENTS`,
  `MIGRATE_ON_PREVIEW`, `LOCAL_TEST_PAYMENTS_SECRET`,
  `GOOGLE_OAUTH_DEV_ISSUER_URL`, `SEED_ALLOW_REMOTE`. These are
  test-only; the code ignores several of them in production anyway.
- ☐ Preview uses **different** secrets and a **separate database** (or no
  database-writing features).

## 2. Database

- ✅ Postgres via Prisma 7. Pooled URL at runtime, direct URL for migrations.
- ✅ Payments, refunds and signed agreements can't be deleted through the
  app ([DATABASE.md](DATABASE.md#records-that-are-never-deleted)).
- ✅ The seed refuses production and non-local databases.
- ☐ Production DB region is next to the Vercel function region (Dubai →
  e.g. `me-central`/`eu-central`; pick one and match both).
- ☐ Connection pooling is enabled on the provider (PgBouncer/Neon pooler).

## 3. Migrations

- ✅ Migrations run only on the **Production** build (`scripts/build.mjs`),
  never on Preview unless explicitly enabled.
- ✅ `npm run check` blocks unreviewed destructive migration SQL.
- ✅ 34 migrations. No drift: schema and migrations match.
- ☐ Vercel build command is the repo's `npm run build` (no dashboard
  override).
- ☐ On the first production deploy, read the build log line
  `Applying database migrations` and confirm it ends with "All migrations
  have been successfully applied" or "No pending migrations".

## 4. Payment credentials — BLOCKED EXTERNAL STEP

- ✅ Production refuses the sandbox gateway. Online checkout is off and
  admins record offline payments (bank transfer, cash, card terminal).
  The amount comes from the server's quote.
- ✅ The provider-neutral architecture is ready: lifecycle, webhook,
  reconciliation, refunds and audit log. The gaps are marked
  `INTEGRATION POINT` in `payments/`.
- ☐ Choose the payment provider (UAE bank/PSP) and get its **API docs,
  sandbox credentials and live credentials**. No provider endpoints were
  invented.
- ☐ A developer implements the provider's `PaymentGateway` against those
  docs, tests it in the provider's sandbox with `npm run test:e2e`
  patterns, then sets `PAYMENT_PROVIDER` and its secrets in Production.
- ☐ Until then, raise Admin → Settings → default acceptance deadline
  (currently 3 h), so held booths don't lapse while DAH collects payment
  offline.

## 5. Payment webhooks

- ✅ `POST /api/webhooks/payments/<provider>`:
  - signature verified by the gateway;
  - idempotent per provider event id;
  - exact amount and currency check;
  - guarded status transitions;
  - a late or mismatched payment is flagged for attention, never
    auto-sold.
- ☐ When the provider is live: register
  `https://<domain>/api/webhooks/payments/<provider>` in the provider
  dashboard and put its signing secret in Vercel.
- ☐ Send one test event from the provider dashboard and confirm it appears
  on the payment's history (Admin → application → payment → History).

## 6. Infobip (WhatsApp)

- ✅ OTP goes over the WhatsApp AUTHENTICATION template only; there's no
  SMS fallback. Codes are stored HMAC-only, capped at 5 attempts, with a
  cooldown. Tested end to end against a fake Infobip (30 checks).
- ☐ In the Infobip portal:
  - the WhatsApp sender is approved;
  - the authentication template named in `INFOBIP_WHATSAPP_AUTH_TEMPLATE`
    is **APPROVED** in that language;
  - the utility templates you want are approved.
- ☐ Delivery reports URL:
  `https://<domain>/api/webhooks/infobip-whatsapp?secret=<INFOBIP_WEBHOOK_SECRET>`.
- ☐ Admin → Communications → Templates → **Sync**. Then map use cases in
  Registry, and check that each shows "Ready".
- ☐ Verify your own phone on production once (Profile → Verify). Confirm
  the code arrives and the Copy Code button works.

## 7. Domain

- ☐ Add the domain in Vercel → Domains (apex + `www`, one redirecting to
  the other).
- ☐ Set the registrar DNS records exactly as Vercel shows them.
- ☐ `NEXT_PUBLIC_SITE_URL` matches the final canonical host, then
  **redeploy**. `NEXT_PUBLIC_*` values are baked in at build time.

## 8. SSL

- ✅ HSTS header sent (`max-age=63072000; includeSubDomains`), and a
  strict CSP.
- ☐ Vercel shows the certificate as issued for every domain.
  `https://` loads, and `http://` redirects.
- ☐ Only after everything works on HTTPS, consider HSTS preload. It's
  hard to undo.

## 9. OAuth callbacks (only if enabling Google sign-in)

- ☐ Google Cloud Console → OAuth client (Web):
  - Authorised redirect URI:
    `https://<domain>/api/auth/google/callback`
  - Authorised JavaScript origin: `https://<domain>`
- ☐ OAuth consent screen published (not "Testing"). Add the privacy
  policy URL `https://<domain>/legal/privacy`.
- ☐ Set `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` and redeploy. Link a
  test vendor from Profile, then sign out and use "Continue with Google".

## 10. Blob storage

- ✅ Public store for images. Private store for trade licences, served
  only through authenticated routes with `private, no-store`. Uploads are
  checked by magic bytes.
- ☐ Vercel → Storage: the **public** store is connected, and its token
  and ID are set (§1). The **private** store is connected to the project
  (it's resolved automatically via OIDC on Vercel).
- ☐ Upload one gallery image and one trade licence on production.
  Confirm the image shows and the licence opens only for the admin.

## 11. Email

- ☐ Resend → Domains: the sending domain is verified (SPF, DKIM; add
  DMARC).
- ☐ Resend webhook → `https://<domain>/api/webhooks/resend`, signing
  secret in `RESEND_WEBHOOK_SECRET`.
- ☐ Trigger a password reset on production. Confirm the email arrives
  (not in spam) and Admin → Emails shows DELIVERED.

## 12. Cron

- ✅ `vercel.json`: `/api/cron/notifications` hourly. It sends reminders,
  expires lapsed holds and reconciles open payments, and refuses calls
  without `CRON_SECRET`.
- ☐ The Vercel plan supports an hourly cron (the Hobby plan runs crons
  once a day only).
- ☐ `CRON_SECRET` is set. After an hour, Vercel → Crons shows a
  successful run.

## 13. Search Console — BLOCKED EXTERNAL STEP

- ✅ Verification supported via `GOOGLE_SITE_VERIFICATION` (meta tag), or
  use DNS verification. Nothing is faked.
- ☐ Add the property (Domain property via DNS is best), verify, then
  submit `https://<domain>/sitemap.xml`.
- ☐ After a few days: check Coverage. `/vendor/*`, `/admin/*` and `/api/*`
  should be excluded; public pages indexed.

## 14. Sitemap

- ✅ `/sitemap.xml` lists public pages, legal pages and published events.
  It refreshes hourly.
- ☐ On production, open `/sitemap.xml` and confirm every URL uses the
  real domain (not localhost or a `vercel.app` URL).

## 15. robots

- ✅ `/robots.txt` disallows `/admin`, `/api/`, `/vendor/`. Preview
  deployments are fully `noindex`.
- ☐ On production, open `/robots.txt` and confirm it isn't the preview
  "Disallow: /" (that would mean the deployment isn't recognised as
  production).

## 16. Admin account

- ☐ `ADMIN_PASSWORD` is long, unique and stored in a password manager.
  Rotate it if it was ever shared in chat or email.
- ☐ Log in, then Admin → Settings → Active admin sessions. Sign out any
  device you don't recognise.
- ☐ Admin → Settings: WhatsApp community link, contact details, default
  acceptance deadline and multi-booth defaults are correct.
- ☐ Admin → Legal Pages: review Privacy, Terms and Refund text, then
  publish. Admin → Signup Terms and each event's Terms are published.

## 17. Backups

- ☐ Point-in-time recovery is enabled on the production database. Note
  the retention period.
- ☐ Take and securely store one manual backup before launch
  ([DATABASE.md](DATABASE.md#backups-and-recovery)). Practise a restore
  into a *new* database once.

## 18. Logging

- ✅ Server errors go to Vercel runtime logs with a `[area]` prefix.
  Secrets, OTP codes and card data are never logged (tested).
- ✅ Audit trails in the database:
  - payments (`PaymentEvent`);
  - email (Admin → Emails) and WhatsApp (Communications → Delivery Logs)
    deliveries;
  - phone verifications;
  - admin vendor removals.
- ☐ Vercel log retention on your plan is enough, or set up a log drain.

## 19. Monitoring

- ✅ `GET /api/health` → 200 `{ok:true, database:"up"}`, or 503 if the
  database is down. It exposes no configuration.
- ☐ Point an uptime monitor at `https://<domain>/api/health` and at `/`,
  with alerts to DAH's phone or email. Any service works, e.g. Better
  Stack, UptimeRobot or Vercel monitoring.
- ☐ Optional: add an error tracker such as Sentry. None is installed
  today.
- ☐ Weekly: Admin → Payments → filter **Needs attention**, and Admin →
  Emails → filter **Failed**.

## 20. Security

- ✅ All findings in [SECURITY_AUDIT.md](SECURITY_AUDIT.md) are fixed or
  documented. `npm audit` is at 0.
- ✅ Security headers and CSP are in place:
  - every API response is sent `no-store`;
  - server-side authorisation on every route;
  - Postgres-backed rate limits;
  - open-redirect protection;
  - sanitised admin HTML.
- ☐ Vercel Deployment Protection is on for Preview deployments.
- ☐ Only the people who need it have access to Vercel, the database,
  Infobip, Resend, Google and the registrar, with 2FA on each.
- ☐ `.env` files are never committed (`.gitignore` covers them). If a
  secret was ever pasted somewhere public, rotate it.

## 21. End-to-end transaction test (on production, after everything above)

Use a real test vendor account and a test event with one booth, priced
low.

1. ☐ Register as a vendor. The trade licence upload works.
2. ☐ Verify the phone number: the WhatsApp code arrives and is accepted.
3. ☐ Apply to the test event → as admin, **Accept** → vendor gets the
   email/WhatsApp.
4. ☐ Vendor selects a booth → Booking Review → accepts Event Terms. The
   booth shows as held.
5. ☐ **Offline payment (today's flow):** admin → application → Record
   offline payment. Reference required, amount pre-filled from the server.
   - The booth becomes SOLD.
   - The vendor gets a receipt (email + Payments page).
   - Admin → Payments shows it.
   - The CSV export contains it.
6. ☐ **When a live provider exists:** repeat step 5 as an online card
   payment:
   - the vendor is redirected to the provider and back;
   - "confirmed" appears only after the webhook arrives;
   - try a declined card and a cancelled payment too.
7. ☐ Record a small refund (Admin → payment → Record a refund).
   - The booking stays confirmed.
   - The refund appears in the history and the export.
8. ☐ Remove the test event: set it to **Closed**. Events with payments or
   signed terms can't be deleted, by design.

## 22. Before merging to `main`

- ☐ `npm run check`, `npm test` and `npm run test:e2e` pass locally.
- ☐ The branch's Vercel Preview has been clicked through: public pages,
  vendor flow, admin.
- ☐ Merge, watch the Production build log (migrations), then run §21.
