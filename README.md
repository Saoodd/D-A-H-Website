# Dar Al Hay (DAH) — Website

DAH's own branded site for showcasing its community pop-up markets and running
vendor applications, booth bookings and payments — plus a full admin panel for
DAH to manage events, floor plans, pricing and vendors day to day.

Built with Next.js (App Router, TypeScript), Prisma + Postgres, Tailwind CSS,
Resend for email, and a swappable sandbox payment gateway.

## Contents

- [Quick start](#quick-start)
- [Environment variables](#environment-variables)
- [Database](#database)
- [Admin panel](#admin-panel)
- [Updating events, the floor plan, pricing & gallery](#updating-events-the-floor-plan-pricing--gallery)
- [Payments](#payments)
- [Email](#email)
- [Localization (EN/AR)](#localization-enar)
- [Deploying](#deploying)
- [Connecting a custom domain](#connecting-a-custom-domain)
- [Project structure](#project-structure)
- [What's stubbed / needs DAH's input](#whats-stubbed--needs-dahs-input)

## Quick start

```bash
npm install
cp .env.example .env
# edit .env — set ADMIN_PASSWORD, AUTH_SECRET, and DATABASE_URL (a Postgres
# connection string — see "Database" below for a local option)

npx prisma migrate dev   # applies the schema
npm run db:seed          # seeds pricing, a demo event/floor plan, gallery placeholders

npm run dev               # http://localhost:3000
```

Admin panel: [http://localhost:3000/admin/login](http://localhost:3000/admin/login)
— password is whatever you set as `ADMIN_PASSWORD`.

A seeded demo vendor login (for testing the vendor dashboard):
`demo.vendor@example.com` / `password123`.

## Environment variables

See `.env.example` for the full list with comments. Never commit a real `.env`.

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection string, local and in production (see [Database](#database)). |
| `ADMIN_PASSWORD` | The single admin login password. |
| `AUTH_SECRET` | Random secret used to sign admin/vendor session cookies. Generate with `openssl rand -base64 32`. |
| `RESEND_API_KEY` | [Resend](https://resend.com) API key. Leave empty in dev — emails are logged to the console instead of sent. |
| `EMAIL_FROM` | The "from" address for outgoing email. |
| `ADMIN_NOTIFY_EMAIL` | Where DAH receives internal notifications (new application, payment, cancellation request, contact form). |
| `PAYMENT_PROVIDER` | Always `sandbox` for now — see [Payments](#payments). |
| `NEXT_PUBLIC_SITE_URL` | Public base URL, used in emails and OG/meta tags. |

## Database

The app runs on Postgres everywhere — locally and in production
(`prisma/schema.prisma`, `provider = "postgresql"`). This is deliberate:
SQLite does **not** handle concurrent writes safely across multiple
serverless function instances (Vercel/Netlify run your API routes as
separate, ephemeral instances), so this project doesn't use it at all,
including for local dev.

**In production**: provision a Postgres database — Vercel Postgres (Storage
tab → Create Database; auto-injects `DATABASE_URL`), Neon, or Supabase all
work — then run `npx prisma migrate deploy` against it once after the first
deploy.

**For local development**, either:
- Point `DATABASE_URL` at a free cloud Postgres (Neon/Supabase both have
  generous free tiers, and it's the least setup), or
- Run Postgres locally, e.g.:
  ```bash
  # macOS
  brew install postgresql@16 && brew services start postgresql@16
  createuser -s dah && createdb dah_dev -O dah

  # Debian/Ubuntu
  sudo apt-get install postgresql && sudo pg_ctlcluster 16 main start
  sudo -u postgres psql -c "CREATE ROLE dah LOGIN PASSWORD 'dah_dev_pw' CREATEDB;"
  sudo -u postgres psql -c "CREATE DATABASE dah_dev OWNER dah;"
  ```
  then set `DATABASE_URL="postgresql://dah:dah_dev_pw@localhost:5432/dah_dev"`
  (adjust if you didn't set a password) and run `npx prisma migrate dev`.

Everything else in the app (queries, the booth-hold logic, etc.) is
already Postgres-ready and needs no other changes.

## Admin panel

`/admin/login` — single admin password (`ADMIN_PASSWORD`). From there DAH can:

- **Applications** — view every vendor application, filter by
  Pending / Rejected / Accepted / Unpaid / Paid / Expired, approve/reject,
  extend or revoke an acceptance deadline, resend the approval email, add a
  manual charge/adjustment with a reason, export to CSV.
- **Events** — create/edit/delete events (dates, location, description,
  cover image, category needs, status, its own WhatsApp vendor group link,
  and an optional acceptance-deadline-hours override), build that event's
  floor plan and booth inventory from scratch, or duplicate an existing
  event's floor plan into a new one (fresh, independent booth records, all
  reset to available).
- **Pricing** — edit the AED price for each booth size tier (drives
  checkout everywhere); add a new size tier without a code change.
- **Gallery** — add/reorder/remove photos shown on the public gallery page.
- **Payments** — read-only view of every payment attempt, plus pending
  cancellation requests to action manually.
- **Settings** — the site-wide Main DAH Community Group WhatsApp link, and
  the default acceptance/payment deadline (hours).

All admin routes/pages check the admin session **server-side** — there is no
admin data or mutation exposed to an unauthenticated request, regardless of
what the frontend shows or hides.

## Updating events, the floor plan, pricing & gallery

Nothing here requires touching code — it's all done through
`/admin`:

- **New monthly market**: Admin → Events → New event → optionally pick
  "Base floor plan on existing event" to copy last month's layout, then
  tweak individual booths. Add the vendor categories relevant to this
  market as chips — they show on the public event page and become the
  choices offered to vendors applying to it.
- **Floor plan image**: paste a URL to a photo/scan of the real venue in
  the event's "Floor plan image URL" field, and the floor plan builder
  (and the vendor's booth-selection map) renders booths directly on top of
  it — click anywhere on the image to place one.
- **Floor plan / booths**: Admin → Events → an event → the floor plan
  builder. The primary flow is **click the map to add a booth** — pick a
  size and code prefix, then click; the next code (e.g. `A1`, `A2`, …) is
  filled in automatically. Click an existing booth to change its status,
  assign/reassign it to an approved vendor, fine-tune its position, or
  delete it. "Advanced" (collapsed by default) still has the old single-add
  form, plus **bulk import** — paste the **full real booth list** as JSON,
  which is how you load the real A#/B# kiosk IDs and layout once confirmed
  (see the TODOs in `prisma/seed.ts`).
- **Pricing**: Admin → Pricing sets the site-wide default per booth size.
  Admin → Events → an event → "Pricing for this event" overrides that
  default for just that market (e.g. a launch discount) without touching
  the global price.
- **Gallery photos**: Admin → Gallery.

## Payments

Payments are behind a **generic, swappable interface**
(`payments/gateway.ts`: `createCharge` / `confirmPayment` / `handleWebhook`),
currently backed by a sandbox implementation with no external calls, so the
whole flow (select booth → checkout → "pay" → receipt) works end-to-end with
fake transactions. Apple Pay is the priority payment method per the brief;
the checkout UI is mobile-first with an Apple Pay–styled button, but a real
Apple Pay session requires HTTPS + domain verification with whichever
provider DAH chooses (Ziina / Shopify Payments / ADCB) — that's a
deployment-stage step, not something fakeable in sandbox.

**To go live**: implement the `PaymentGateway` interface in
`payments/gateway.ts` for the chosen provider, and switch
`PAYMENT_PROVIDER`. That file has a `TODO` comment marking exactly this.
Nothing else in the app needs to change — checkout API routes only ever
call the generic interface.

DAH must complete KYC directly with the chosen provider — this repo
intentionally never touches real payment credentials.

## Email

All outbound email goes through `lib/email.ts` (Resend). Every key event
sends mail: application received (vendor + admin), approved, acceptance
expired, rejected, payment success (with receipt), payment failed (with a
retry link), and cancellation-requested (to admin).

Without `RESEND_API_KEY` set, emails are logged to the console instead of
sent — useful for local development. Set a real key + verified sending
domain in Resend before going live.

## Localization (EN/AR)

All site copy lives in `lib/i18n/translations.ts` (`en`/`ar` keyed
objects), consumed via `useLocale()` (`lib/i18n/context.tsx`). The
language toggle in the header switches locale, sets `<html dir="rtl">` for
Arabic, and swaps in an Arabic-friendly font (Cairo) for headings/body.
Event/vendor content entered through the admin panel is plain text and
isn't auto-translated — add Arabic copy directly when creating an event if
needed.

## Deploying

### Vercel

1. Push this repo to GitHub and import it in Vercel.
2. Set all variables from `.env.example` in Project Settings → Environment
   Variables (production + preview).
3. Point `DATABASE_URL` at a hosted Postgres instance (see
   [Database](#database)) — don't rely on SQLite in production.
4. Vercel runs `npm run build`, which includes `postinstall: prisma
   generate`. After the first deploy, run `npx prisma migrate deploy`
   against the production database (e.g. via `vercel env pull` +local run,
   or a one-off Vercel deployment hook).

### Netlify

1. Import the repo, framework preset "Next.js".
2. Same environment variables as above.
3. Same Postgres + `prisma migrate deploy` step.

## Connecting a custom domain

You said you already own a domain — here's where to point it:

**On Vercel**: Project → Settings → Domains → add your domain. Vercel shows
the exact DNS records to add at your registrar — typically an `A` record
(`76.76.21.21`) or `CNAME` for a subdomain pointing at
`cname.vercel-dns.com`. Propagation is usually minutes to a few hours.

**On Netlify**: Site settings → Domain management → Add a domain. Netlify
shows either its own nameservers to delegate to, or an `A`/`CNAME` record
to add at your existing DNS provider.

Either way, once the domain resolves, set `NEXT_PUBLIC_SITE_URL` to your
real `https://` domain and redeploy — it's used in email links and
Open Graph tags.

## Project structure

```
app/
  (site)/            Public + vendor-facing pages (shared header/footer)
    markets/         Upcoming Markets list + event detail
    vendors/         Vendor info + application form
    gallery/, contact/, legal/
    vendor/          Vendor login, dashboard, per-application detail (booth
                      selection + checkout + receipt live here)
  admin/
    login/           Admin login (public)
    (protected)/     Everything else — server-side auth-gated layout
  api/               All server routes (applications, vendor/admin auth,
                     booths, checkout, admin CRUD, CSV export)
components/          Shared UI (header/footer, floor plan renderer, countdown)
lib/                 Business logic: auth, email, pricing, expiry/holds,
                     i18n, validation, rate limiting, status computation
payments/gateway.ts  Swappable payment provider interface + sandbox impl
prisma/              schema.prisma, migrations, seed.ts
```

## What's stubbed / needs DAH's input

- **Floor plan data**: `prisma/seed.ts` ships a small placeholder floor
  plan modelled loosely on the reference spec's structural zones. The real
  booth count/IDs and current sold/available status need to be pasted in
  via Admin → Events → an event → "Bulk import booths" once confirmed.
- **Logo**: `components/Logo.tsx` is a text-based placeholder built to match
  the described DAH wordmark (thin geometric caps, Arabic mark, "EVENTS"
  caption). Swap in the real logo file once available.
- **Brand colors**: CSS variables in `app/globals.css`
  (`--color-cream*`, `--color-brown*`) are set from the cream/brown hexes
  given in the brief (`#EDE9E2` / `#6B4429`). If you have the actual logo
  PNG, sample its exact pixel colors and update these variables.
- **Legal pages** (`/legal/terms`, `/legal/privacy`, `/legal/refunds`):
  clearly marked placeholder/template copy — have DAH (or counsel) review
  before launch.
- **Payment provider**: sandbox only, per the brief's explicit scope —
  see [Payments](#payments).
- **Gallery photos**: seeded with stock placeholder images; replace via
  Admin → Gallery.
- **Community WhatsApp links**: seeded with a placeholder value; set the
  real Main DAH Community Group link in Admin → Settings, and each event's
  vendor group link when editing that event.
