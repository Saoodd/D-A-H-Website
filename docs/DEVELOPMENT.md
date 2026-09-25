# Development

## Prerequisites

- **Node 22** (`.nvmrc`; `nvm use`). Next 16 and Prisma 7 need Node 20.19 or newer.
- **Postgres 14+**, local or a free cloud instance (Neon, Supabase). SQLite
  is not supported: booth holds rely on Postgres transaction semantics.

### Local Postgres

```bash
# macOS
brew install postgresql@16 && brew services start postgresql@16
createuser -s dah && createdb dah_dev -O dah

# Debian/Ubuntu
sudo apt-get install postgresql && sudo service postgresql start
sudo -u postgres psql -c "CREATE ROLE dah LOGIN PASSWORD 'dah_dev_pw' CREATEDB;"
sudo -u postgres psql -c "CREATE DATABASE dah_dev OWNER dah;"
```

## Setup

```bash
npm install                  # also runs `prisma generate` (client → lib/generated/prisma, git-ignored)
cp .env.example .env
```

In `.env`, set at least:

| Variable | Local value |
|---|---|
| `DATABASE_URL` | `postgresql://dah:dah_dev_pw@localhost:5432/dah_dev` |
| `DIRECT_URL` | same as `DATABASE_URL` locally (used by migrations) |
| `AUTH_SECRET` | `openssl rand -base64 32` |
| `ADMIN_PASSWORD` | anything |

Everything else is optional locally. On startup the dev server lists which
features are off because a variable is missing (names only), e.g. no
emails without `RESEND_API_KEY`.

```bash
npx prisma migrate dev       # apply migrations to the local DB
npm run db:seed              # demo data (never run against production)
npm run dev                  # http://localhost:3000
```

## Accounts for local testing

- **Admin:** `/admin/login` with your `ADMIN_PASSWORD`.
- **Seeded vendors** (password `password123`):
  - `demo.vendor@example.com`: business verified.
  - `pending.vendor@example.com`: business not verified.

  Applying to an event needs a **verified mobile number**. The WhatsApp OTP
  only sends with real Infobip credentials, so locally use Admin → Vendors
  → the vendor → **Contact verification → Verify Manually**. It is
  recorded in the vendor's verification log.

## Payments locally

| `PAYMENT_PROVIDER` | Behaviour |
|---|---|
| unset / `sandbox` | Checkout shows sandbox buttons; you pick success or failure. Dev builds only; production disables this. |
| `local-test` (+ `LOCAL_TEST_PAYMENTS_SECRET`) | Exercises the real LIVE path: redirect → return page → HMAC-signed webhook / reconciliation → refunds. Moves no money; refused in production builds. |

Admins can always use **Record offline payment** on an application. See
[PAYMENTS.md](PAYMENTS.md).

## Checks

```bash
npm run check                # lint + typecheck (run before every push)
npm test                     # unit tests (tests/*.test.ts, Node's built-in runner via tsx; tests/setup.cjs stubs `server-only`)
npm run build                # full production build (also applies local migrations)
```

## Useful commands

```bash
npx prisma studio                                # browse the local DB
npx prisma migrate dev --name <change> --create-only   # write a migration, review the SQL, then:
npx prisma migrate dev                           # apply it locally
npx next typegen                                 # regenerate route types after adding a page/layout
```

## Troubleshooting

- **`P1001: Can't reach database server`**: Postgres isn't running
  (`sudo service postgresql start` / `brew services start postgresql@16`).
- **A route you just added returns Next's HTML 404 in dev**: stale dev
  cache. Stop the server, `rm -rf .next/dev`, start again.
- **TypeScript errors in `.next/dev/types/validator.ts` after adding a
  layout or page**: `npx next typegen`.
- **`429 Too many attempts` while testing logins locally**: the rate
  limiter is Postgres-backed and shared across processes. Clear it
  locally with `DELETE FROM "RateLimitBucket";`, and never do this on
  production.
- **Imports from Prisma**: use `@/lib/generated/prisma/client` (Prisma 7
  generates the client into the repo, not `node_modules`), and
  `prisma` from `@/lib/prisma` for queries.
