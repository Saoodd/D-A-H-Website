# Contributing

This site takes real bookings and money for DAH. The rules below keep it
that way.

## Workflow

1. Branch from `main`. Keep each change focused: one feature or fix per
   branch.
2. Before pushing: `npm run check` (lint + typecheck) and `npm test`.
   For anything touching pages or routes, also `npm run build`, and click
   through the affected flow in a browser.
3. Commit messages: short imperative subject (`Phase 6: …`, `Fix …`,
   `Add …`), then a body explaining **why**, not just what.
4. Open a pull request. The Vercel Preview deployment builds without
   touching the production database (see
   [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)).

## Code conventions

- **Match the surrounding code:** naming, comment density, file layout.
  Comments explain why a rule exists (a race, a business decision, a
  security reason), not what the next line does.
- **Formatting:** 2-space indent, double quotes, semicolons, trailing
  commas, LF line endings (`.editorconfig`). There is deliberately **no
  auto-formatter**: Prettier would have rewritten about half the codebase.
  Don't reformat code you aren't otherwise changing.
- **Server components by default.** `"use client"` only where
  interactivity needs it. Anything importing secrets, Prisma or
  `lib/auth` starts with `import "server-only"`.
- **Next 16 specifics:** `proxy.ts` (not `middleware.ts`); `params` and
  `searchParams` are Promises; read the bundled docs in
  `node_modules/next/dist/docs/` before relying on older patterns.
- **Validation:** request bodies are parsed with zod (`lib/validation.ts`)
  on the server; client-side checks are UX only.
- **Copy:** user-facing text is bilingual (EN/AR). Add both.

## Database changes

- Always `npx prisma migrate dev --name <change> --create-only`, **read the
  generated SQL**, then apply it. The full rules are in
  [docs/DATABASE.md](docs/DATABASE.md).
- **Additive by default:** new nullable columns or columns with defaults,
  new tables. Removing or renaming happens in two steps: stop using it
  and deploy, then drop it in a later release.
- Never edit a migration that has already been applied anywhere shared.
- Never run `migrate reset`, `db push --force-reset` or the seed against
  production. The seed refuses non-local databases.
- `npm run check` fails on destructive migration SQL (drops, renames,
  type changes, bulk updates) unless it's marked
  `-- destructive-reviewed: <reason>`.
- Migrations reach production only via the Production build
  (`scripts/build.mjs`).

## Rules that must not be broken

- **Money:** prices are computed on the server (`getBoothPrice`), never
  taken from a request. A payment is marked paid only by a verified
  provider webhook, a server-to-server status check, or an admin recording
  money received, **never** by a browser redirect or query string. See
  [docs/PAYMENTS.md](docs/PAYMENTS.md).
- **No fake integrations:** don't invent provider endpoints or pretend a
  sandbox is live. Mark real-world integration points clearly instead.
- **Secrets:** never commit them, never log them, never send them to the
  browser. Only `NEXT_PUBLIC_*` variables reach client code, and none of
  them are secret.
- **Authorisation:** every API route checks the session itself
  (`getVendorSession` / `requireAdmin`) and scopes queries to the caller.
  `proxy.ts` is only a convenience redirect, not an access check.
- **Verification:** phone verification (WhatsApp OTP via Infobip) is
  required to apply to events; email verification stays optional. Don't
  change either without an explicit decision from DAH. Don't move OTP
  back to SMS/Twilio.
- **Booth availability, payment state and deadlines are never cached.**
  Read them fresh from the database.
- **Admin-authored HTML** is rendered only through `sanitizeAgreementHtml`
  / `sanitizeEmailHtml`.

## Adding environment variables

1. Read it on the server (or `NEXT_PUBLIC_*` only if it's genuinely public).
2. Register it in `lib/env.ts` with the right level and a one-line effect.
3. Document it in `.env.example`, and in `docs/DEPLOYMENT.md` if it must be
   set in Vercel.
