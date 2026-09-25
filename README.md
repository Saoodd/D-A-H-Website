# Dar Al Hay (DAH) — Website

DAH's own site for its Dubai events and pop-ups. Vendors create a business
account, apply to events, pick booths on a live floor plan, accept each
event's terms and pay. DAH runs everything from an admin panel: events,
floor plans, pricing, applications, vendors, payments, agreements, legal
pages, and email and WhatsApp communications.

**Stack:** Next.js 16 (App Router, TypeScript) · React 19 · Tailwind CSS v4
· Prisma 7 + Postgres · Resend (email) · Infobip (WhatsApp OTP and
notifications) · Vercel (hosting, cron, Blob storage). English and Arabic
(RTL), light and dark themes.

## Documentation

| Doc | What's in it |
|---|---|
| [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) | Local setup, scripts, test accounts, payment modes, troubleshooting |
| [CONTRIBUTING.md](CONTRIBUTING.md) | How to make changes safely: checks, migrations, security rules |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Vercel, environment variables, migrations, domain, Search Console, launch checklist |
| [docs/PAYMENTS.md](docs/PAYMENTS.md) | Payment lifecycle, offline payments, refunds, webhooks, integrating a real provider |
| [docs/SECURITY_AUDIT.md](docs/SECURITY_AUDIT.md) | Security findings and their status |
| [docs/FLOOR_PLAN_ARCHITECTURE.md](docs/FLOOR_PLAN_ARCHITECTURE.md) | The millimetre-based floor-plan model |
| [docs/FULL_PRODUCTION_MODERNIZATION_PROGRESS.md](docs/FULL_PRODUCTION_MODERNIZATION_PROGRESS.md) | Progress log of the production-hardening work |

## Quick start

```bash
nvm use                      # Node 22 (.nvmrc)
npm install
cp .env.example .env         # set DATABASE_URL, DIRECT_URL, AUTH_SECRET, ADMIN_PASSWORD
npx prisma migrate dev       # create the schema in your local database
npm run db:seed              # demo event, floor plan, pricing, demo vendors
npm run dev                  # http://localhost:3000  (admin: /admin/login)
```

Full details, including a local Postgres setup: [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).

## How it works, briefly

- **Vendor accounts.** Signing up on `/vendors` creates a business account,
  not an application. Applying to an event requires a **verified mobile
  number** (WhatsApp OTP); email verification is optional.
- **Applications → booth → terms → payment.** DAH accepts or rejects each
  application. An accepted vendor gets a deadline, selects one booth (two
  where allowed) on the floor plan, reviews the booking, accepts that
  event's Terms, then pays. The server prices every booth; the browser
  never sets an amount.
- **Payments.** No live payment provider is integrated yet, so production
  runs with online checkout off: vendors are told DAH will contact them,
  and admins record bank-transfer, cash or card-terminal payments.
  Refunds, webhooks, reconciliation and the provider integration point
  are all built and documented in [docs/PAYMENTS.md](docs/PAYMENTS.md).
- **Admin panel** (`/admin`): events and floor-plan builder (CAD/DXF
  import, mass booth creation), pricing, applications (bulk
  accept/reject), vendors (notes, warnings, verification, deletion),
  payments and receipts, agreements (signup and per-event terms), legal
  pages, gallery, communications (email and WhatsApp templates), and
  settings including active admin sessions.
- **Security.** Server-side authorisation on every route; DB-backed
  sessions with per-device sign-out; Postgres-backed rate limiting;
  signed webhooks; CSP and security headers; sanitised admin-authored
  HTML. See [docs/SECURITY_AUDIT.md](docs/SECURITY_AUDIT.md).

## Project structure

```
app/
  (site)/          Public pages + the vendor area (/vendor/*)
  admin/           Admin login + (protected)/ admin panel
  api/             Route handlers (vendor, admin, checkout, webhooks, cron, health)
components/        Shared UI (ui/ primitives, floorplan/, admin/, vendor/, receipts/)
lib/               Business logic: auth & sessions, payments, agreements,
                   booth holds/expiry, pricing, email, WhatsApp, i18n, SEO …
payments/          Payment provider boundary (gateway.ts)
prisma/            schema.prisma, migrations/, seed.ts
scripts/           build.mjs (migration-safe build)
docs/              Documentation listed above
proxy.ts           Next 16 proxy: sends signed-out visitors away from private vendor pages
```

## Scripts

| Script | Does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Migrations (production/local only; see DEPLOYMENT.md) + production build |
| `npm run start` | Serve a production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript, no emit |
| `npm run check` | lint + typecheck (run before every push) |
| `npm test` | Automated tests (see docs/DEVELOPMENT.md) |
| `npm run db:migrate` / `db:seed` / `db:studio` | Prisma helpers for your **local** database |
