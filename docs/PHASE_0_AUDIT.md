# Phase 0 — Full Repository Audit

Written before any modernization work began, per the master task's Phase 0
instructions. Findings are classified CRITICAL / HIGH / MEDIUM / LOW /
OPTIONAL. This is a facts-and-findings document, not an implementation plan —
remediation for each item lives in the phase that owns it (referenced inline).

## 1. Stack overview

- **Framework**: Next.js 16.3.4 (App Router), React 19.2.8, TypeScript 5.9.3
  (strict mode on), Tailwind CSS v4.
- **Database**: Postgres via Prisma 5.20.0 (`@prisma/client` 5.20.0), 31
  models, 5 migrations. No `DIRECT_URL`-less setups — both `DATABASE_URL` and
  `DIRECT_URL` are in `.env.example` (typical Neon/pooled-connection setup).
- **Auth**: fully custom (`lib/auth.ts`) — `jose` for JWT signing, DB-backed
  session rows (`VendorSession`, `AdminSession`) for revocation, `bcryptjs`
  for password hashing. No NextAuth/Auth.js or other auth library.
- **Payments**: `payments/gateway.ts` (repo-root, not under `app/`) — a
  provider-abstraction interface with exactly one implementation,
  `SandboxGateway`, entirely in-memory. No real provider wired.
- **Messaging**: Resend (email), Infobip WhatsApp (OTP + Communications
  Center broadcast). No SMS/Twilio (deliberately removed in a prior phase).
- **Storage**: Vercel Blob (`@vercel/blob`), split public/private stores.
- **Validation**: Zod 4.5.4 throughout API routes.
- **Rich text**: Tiptap (Agreement/Terms editor), sanitized with
  `isomorphic-dompurify` before render.
- **No test framework installed** — no Jest/Vitest/Playwright in
  `package.json`, no `*.test.ts(x)` files anywhere, no `playwright.config.*`.
  All "testing" in this project's history was manual Playwright browser
  automation via a Claude Code skill, never committed as a suite. → Phase 16.
- **No CI** — no `.github/workflows/`. Nothing gates a push/PR on
  typecheck/lint/build today. → Phase 9.
- **No `middleware.ts`** anywhere in the repo (confirmed by search). Route
  protection is done per-route/per-page, not centrally. See §3.

## 2. Directory structure

```
app/
  admin/
    login/                    — public admin login page + API route
    (protected)/               — route-group with a SHARED layout.tsx that
                                  gates the entire subtree on getAdminSession()
  (site)/
    vendor/                    — vendor auth pages (login/register/forgot-*)
                                  AND the authenticated dashboard/applications/
                                  profile/payments/agreements pages, all under
                                  the SAME route group with NO shared gate —
                                  each authenticated page does its own inline
                                  getVendorSession() check (see §3)
    events/, gallery/, contact/, legal/, vendor-terms/  — public pages
  api/
    admin/, vendor/, applications/, booths/, checkout/, cron/, events/,
    webhooks/, cancel/, contact/    — 98 route.ts files total
lib/            — 37 top-level files, plus communications/, floorplan/,
                  notifications/, whatsapp/, email/, i18n/, theme/ subdirs
components/     — admin/, ui/, floorplan/, agreements/, receipts/, vendor/
payments/       — gateway.ts only (odd location: repo root, not app/ or lib/)
prisma/         — schema.prisma (1054 lines, 31 models), 5 migrations, seed.ts
docs/           — FLOOR_PLAN_ARCHITECTURE.md (pre-existing, thorough)
```

**Finding (LOW)** — `payments/gateway.ts` lives at the repo root, sibling to
`app/`/`lib/`/`components/`, rather than under `lib/payments/`. Harmless but
inconsistent; Phase 6's architecture will likely fold it into
`lib/payments/` per the master task's suggested layout.

## 3. Route protection model

- **Admin**: centralized — `app/admin/(protected)/layout.tsx` calls
  `getAdminSession()` once and redirects to `/admin/login` if absent. Every
  page under that route group inherits the gate structurally; a new admin
  page automatically gets it just by living in the right folder.
- **Vendor**: **not centralized**. `app/(site)/vendor/` contains both public
  pages (login, register, forgot-password, reset-password) and private pages
  (dashboard, applications, profile, payments, agreements, receipts) as
  siblings in the same route tree, with no shared layout gate. Each private
  page independently calls `getVendorSession()` and redirects if absent
  (confirmed pattern in `app/(site)/vendor/dashboard/page.tsx`).
- **API routes**: same per-route discipline — every handler calls
  `getVendorSession()`/`getAdminSession()`/`requireAdmin()` at its own top.

**Finding (MEDIUM-HIGH)** — the vendor side's lack of a structural gate means
protection is enforced by convention, not by the framework. A future new
vendor page that forgets the session check would silently be public. All
*currently existing* vendor pages were verified to have the check, so this is
not an active vulnerability today, but it's a standing risk for every future
change. **Recommended fix**: mirror the admin pattern — restructure
`app/(site)/vendor/` into `app/(site)/vendor/(public)/` (login, register,
forgot-*, reset-*) and `app/(site)/vendor/(protected)/` (dashboard,
applications, profile, payments, agreements, receipts) with a shared
`(protected)/layout.tsx` gate. This is a folder-move touching every vendor
page's file path and every internal link/redirect that references them —
**genuinely worth doing carefully in its own dedicated slice with full
regression testing**, not as a drive-by change. Flagged for Phase 4
(authentication modernization) since it's naturally part of that work.

## 4. Data model highlights relevant to later phases

- `Payment.status` is a free-text `String @default("PENDING")` with a
  3-value comment-documented convention (`PENDING | SUCCEEDED | FAILED`), not
  a Prisma `enum`. The master task wants a richer status set (CREATED,
  PENDING, AUTHORIZED, PAID, FAILED, CANCELLED, REFUNDED,
  PARTIALLY_REFUNDED) — schema work for Phase 6.
- No refund-related fields/model exist at all today (no `refundedAmount`, no
  refund audit trail) — Phase 6.
- `VendorSession`/`AdminSession` store only `id`, `createdAt`, `expiresAt`,
  `revokedAt` — no device/browser/IP/last-active fields, so an "Active
  Sessions" UI (Phase 4) needs a migration to add them.
- No OAuth-account model (e.g. a `VendorOAuthAccount` linking a Google
  subject ID to a `Vendor`) exists — Phase 4 schema work.
- No legal-content CMS model exists — `/legal/terms`, `/legal/privacy`,
  `/legal/refunds` currently render hardcoded copy (confirmed by their
  existence as plain pages with no admin-editable backing model, distinct
  from the existing `Agreement`/`AgreementAcceptance` models which are
  specifically for **per-event vendor terms**, not site-wide legal pages) —
  Phase 5 needs a new model (e.g. `LegalDocument` with draft/published
  versions).
- `Settings` is a true singleton row (`id @id @default("singleton")`) — a
  sensible place to *not* put legal content (better as its own versioned
  table per the draft/publish/history requirement).

## 5. Dependency currency (`npm outdated`, captured this session)

| Package | Current | Latest | Note |
|---|---|---|---|
| next | 16.3.4 | 16.3.6 | Patch — low risk |
| react / react-dom | 19.2.8 | 19.3.0 | Minor — low risk |
| eslint-config-next | 16.3.4 | 16.3.6 | Patch |
| zod | 4.5.4 | 4.6.5 | Minor |
| resend | 6.26.0 | 6.29.0 | Minor |
| isomorphic-dompurify | 4.2.0 | 4.3.0 | Patch |
| libphonenumber-js | 1.13.13 | 1.13.14 | Patch |
| @types/react, @types/react-dom | 19.2.x | 19.3.0 | Types only |
| tsx | 4.23.13 | 4.23.15 | Patch, dev-only |
| **@prisma/client / prisma** | **5.20.0** | **7.10.0 (8.0.0-rc.17 also published)** | **Major×2 jump — needs a dedicated, careful Phase 2 migration, not a routine bump. Prisma 6/7 changed the generated-client output location and driver-adapter model; do not upgrade blindly.** |
| **typescript** | **5.9.3** | npm reports **7.0.2** as latest | **Suspicious — verify this is a real stable release (not a mistagged prerelease) before trusting it; do not upgrade off a single `npm outdated` line.** |
| eslint | 9.39.5 | 10.11.0 | Major — eslint 10 + `eslint-config-next` compatibility needs checking before upgrading |
| @types/node | 20.19.43 | 26.6.2 | Major — pinned to Node 20 types deliberately; check actual deployed Node version before bumping |

No dependency here is currently a known CVE-flagged version as far as this
audit could determine without live vulnerability-database network access;
severity classification for Phase 2 is about staleness/breaking-change risk,
not confirmed exploits. **Recommendation**: Phase 2 should run `npm audit`
directly (not done in this pass — needs a fresh install/lockfile check) and
treat the Prisma major-version jump as its own isolated slice with a
disposable test database.

## 6. Security-relevant findings

Full detail in `docs/SECURITY_AUDIT.md`. Headline items surfaced during this
audit, most severe first:

1. **CRITICAL** — Payment confirmation is entirely client-driven (no real
   gateway, no webhook, no server-side re-verification of "did money actually
   move"). Not exploitable for real financial loss today only because the
   gateway itself is a sandbox with no real money involved — but the exact
   code pattern must not carry over unchanged into a live gateway. → Phase 6.
2. **HIGH** — Rate limiting (`lib/rateLimit.ts`) is a pure in-memory `Map`,
   explicitly self-documented as not safe across multiple serverless
   instances. On Vercel, this is a soft limit that can be exceeded by an
   attacker hitting different instances/cold starts. → Phase 2/3 follow-up.
3. **MEDIUM-HIGH** — Vendor route protection is convention-based, not
   structural (§3 above). → Phase 4.
4. **MEDIUM** — Infobip WhatsApp webhook had no signature/secret
   verification at all. **Fixed this session** — see
   `docs/SECURITY_AUDIT.md` §Fixed.
5. **LOW** — `vendor/register` leaks account-enumeration info (explicit
   "email already exists" message) — a common, deliberate UX tradeoff for
   registration flows, contrasted with login/forgot-password which are
   correctly enumeration-safe. Left as-is pending a product decision (noted
   in security audit, not auto-changed).
6. Everything else audited (upload validation, secret exposure, CSP,
   SQL-injection surface, HTML sanitization, booth-hold race safety, IDOR on
   sampled routes, OTP implementation, receipt-number atomicity, cron-secret
   verification) came back clean or already well-implemented — see the full
   audit for specifics and file:line references.

## 7. SEO / search-visibility current state

`app/robots.ts`, `app/sitemap.ts`, `app/manifest.ts` **already exist**
(built in a prior phase, not part of this task). Current gaps found:

- `robots.ts` disallows `/admin`, `/api`, `/vendor/dashboard`,
  `/vendor/applications` — but **not** `/vendor/profile`, `/vendor/payments`,
  `/vendor/agreements`, `/vendor/receipts`, `/vendor/verify` (all
  session-gated pages that happen to redirect unauthenticated crawlers to
  `/vendor/login`, so they're not truly indexable, but the disallow list is
  incomplete/inconsistent). → Phase 8.
- `sitemap.ts` only includes published events + a handful of static routes —
  reasonable, no gap found there.
- 42 files across the app already use `export const metadata` /
  `generateMetadata` — a metadata pass already exists; Phase 8 is refinement,
  not a from-scratch build.

## 8. Design system / component library current state

`components/ui/` already has a real primitive set from prior phases
(`Button.tsx` with `loading` state, `Skeleton.tsx` with multiple variants,
plus whatever else exists there — full inventory deferred to Phase 10, not
re-audited in depth in this pass since it was extensively worked on in the
immediately preceding session). `app/globals.css` already has a CSS-custom-
property token system (`--color-cream-soft`, `--color-brown`, etc.) with a
dark-mode override block. Phase 10 is a standardization/gap-filling pass, not
a rebuild — consistent with the master task's explicit "refine, don't
redesign" instruction.

## 9. Deployment / Vercel state

- `vercel.json` exists, defines exactly one cron (`/api/cron/notifications`,
  hourly).
- No `.vercel/` directory locally (correctly gitignored, and not present in
  this container regardless since this is a fresh checkout).
- **This environment has no authenticated Vercel CLI session** (`vercel
  whoami` → "Logged out"). Direct inspection of the live Vercel project's
  Git integration, deploy hooks, ignored-build-step config, domain aliases,
  and environment variables is **not possible from inside this session**.
  Phase 7 will need the user to either grant a way to check this (e.g. paste
  the relevant Vercel dashboard screens/settings) or run a short list of
  `vercel` CLI commands themselves and share the output.
- **BLOCKED EXTERNAL STEP (flagging now, addressed fully in Phase 7)**: to
  investigate the "main pushed but no new Vercel deployment" issue, provide
  either (a) temporary collaborator access, or (b) the output of `vercel
  project ls`, `vercel git ls`, and the Git-integration settings page for
  this project.

## 10. What this audit deliberately did NOT do

- Did not run `npm audit` (needs a clean install pass; deferred to Phase 2).
- Did not attempt to log into Vercel, Google Cloud, or any payment provider
  dashboard — no credentials exist in this environment for any of them.
- Did not modify the Prisma schema, dependencies, or any business logic.
- Did not touch the floor-plan, WhatsApp, or payment *logic* beyond the two
  scoped security fixes recorded in `docs/SECURITY_AUDIT.md`.
