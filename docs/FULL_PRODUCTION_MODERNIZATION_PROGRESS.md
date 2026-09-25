# DAH Events — Full Production Hardening + Modernization

Tracking document for the master production-readiness task. If context is
lost, recover state from: this file, `git log`, and the task list (Phase 0–17
tasks, IDs #318–#335 in this session's tracker).

Companion docs: `docs/PHASE_0_AUDIT.md` (architecture audit),
`docs/SECURITY_AUDIT.md` (security findings + fix status),
`docs/LAUNCH_CHECKLIST.md` (Phase 17, not yet created).

**Ground rules carried through every phase** (from the task brief — repeating
here so they survive compaction): this is an existing, working, production
site. No rebuild. Preserve all working functionality. Phone verification
stays the vendor-application eligibility gate; email verification stays
non-mandatory. No fake payment/Search-Console integration. No invented
credentials. No destructive DB operations. No new Vercel project unless
genuinely necessary. Work phase by phase: inspect → implement → test →
commit → push. Never lose completed work or silently reduce scope.

---

## Status by phase

| Phase | Title | Status |
|---|---|---|
| 0 | Full repository audit | ✅ Done — `docs/PHASE_0_AUDIT.md` |
| 1 | Local development environment | ✅ Done — see "Phase 1" below |
| 2 | Dependency audit + controlled upgrades | ✅ Done — see "Phase 2" below |
| 3 | Complete security audit | ✅ Done — `docs/SECURITY_AUDIT.md`; C1 mitigated, H1/M1/M2/M3/L2 fixed, L1/L3/L4 documented |
| 4 | Auth modernization + active sessions + OAuth | ✅ Code done — Google sign-in waits on credentials (BLOCKED EXTERNAL STEP) |
| 5 | Legal content CMS | ✅ Done — Admin → Content → Legal Pages |
| 6 | Live payment gateway architecture | ✅ Done (provider-neutral) — real provider is a BLOCKED EXTERNAL STEP; see `docs/PAYMENTS.md` |
| 7 | Vercel/deployment + domain audit | ✅ Repo side done — `docs/DEPLOYMENT.md`; dashboard/DNS checks are BLOCKED EXTERNAL STEPs |
| 8 | SEO / search visibility | ✅ Done — Search Console submission is a BLOCKED EXTERNAL STEP |
| 9 | Developer standards | ✅ Done |
| 10 | Design system / component library | ✅ Done — `docs/DESIGN_SYSTEM.md` |
| 11 | Data table modernization + data fetching | ✅ Done — `docs/DATA_FETCHING.md` |
| 12 | UX / performance audit | ✅ Done |
| 13 | Floor-plan regression protection | ✅ Done — `tests/floorplan.test.ts` |
| 14 | WhatsApp/Infobip regression protection | ✅ Done — `tests/whatsapp.test.ts`, `tests/e2e/whatsapp-otp.e2e.ts` |
| 15 | Database/migration safety review | ⏳ Ongoing discipline |
| 16 | Automated testing expansion | ⏳ Not started (currently **zero** committed test files) |
| 17 | Final launch checklist + final report | ⏳ Not started |

---

## Completed this session

- **Phase 0**: Full repository audit completed via direct inspection + 3
  parallel research agents (auth/session, payments/webhooks, uploads/secrets/
  headers). Written up in `docs/PHASE_0_AUDIT.md`.
- **Phase 3 (partial)**: `docs/SECURITY_AUDIT.md` written with full findings
  list, classified CRITICAL/HIGH/MEDIUM/LOW/OPTIONAL. Two safe, scoped fixes
  applied immediately:
  1. `app/api/webhooks/infobip-whatsapp/route.ts` — added shared-secret
     verification (`INFOBIP_WEBHOOK_SECRET`, fails closed if unset), matching
     the existing `CRON_SECRET` pattern. Previously accepted any unsigned
     POST body.
  2. `lib/receipts.ts` — swapped `$queryRawUnsafe` for the parameterized
     `$queryRaw` + `Prisma.sql` tagged template (defense-in-depth; the query
     had no interpolated input, so this was not an active vulnerability, just
     hardening).

- **Phase 1**: Crawled 20 public/vendor-auth/admin pages in a real browser
  capturing console errors, CSP violations, hydration warnings, and failed
  requests.
  - Found: every page logged a CSP error in `next dev` — React's dev build
    needs `eval()` for error-stack reconstruction and `script-src` blocked
    it. Fixed with a dev-only `'unsafe-eval'` in `next.config.ts` (the exact
    pattern from Next 16's bundled CSP guide). Verified the **production**
    CSP header is byte-for-byte unchanged by building and serving a
    production instance.
  - Found: no hydration warnings, no theme-flash warnings.
  - Found: missing env vars failed silently per-feature. Added `lib/env.ts`
    (a registry of every env var and what breaks without it) and
    `instrumentation.ts` (logs a one-time startup report — names only,
    never values; informational in dev, `console.error` in production so it
    surfaces in Vercel logs; never throws).
  - Remaining noise: one failed image request on `/events` and
    `/admin/events`, caused by a fake Blob URL
    (`xyz123.public.blob.vercel-storage.com/...`) saved on an event's
    `coverImage` in the **local dev database only** — test data from an
    earlier session, not code. Left untouched.
  - Noted for Phase 4: Next 16 renamed `middleware.ts` to `proxy.ts`
    (confirmed in the bundled docs) — relevant to centralizing vendor route
    protection.
  - Dev prerequisite (unchanged, already in README): Postgres must be
    running before `npm run dev`.

- **Phase 2**: Dependency audit + three controlled upgrade groups, each
  verified (tsc, lint, build, browser crawl) and committed separately.

  | Package | Was | Now | Security relevance | Breaking risk | Decision |
  |---|---|---|---|---|---|
  | next / eslint-config-next | 16.3.4 | 16.3.6 | patch fixes | low | ✅ upgraded (2A) |
  | react / react-dom (+types) | 19.2.8 | 19.3.0 | — | low | ✅ upgraded (2A) |
  | zod | 4.5.4 | 4.6.5 | validation lib | low | ✅ upgraded (2A) |
  | resend | 6.26.0 | 6.29.0 | email | low | ✅ upgraded (2A) |
  | isomorphic-dompurify | 4.2.0 | 4.3.0 | HTML sanitizer | low | ✅ upgraded (2A) |
  | libphonenumber-js | 1.13.13 | 1.13.14 | OTP phone normalization | low | ✅ upgraded (2A) |
  | tsx | 4.23.13 | 4.23.15 | dev only | low | ✅ upgraded (2A) |
  | uuid (via exceljs) | 8.3.2 | 11.1.1 | moderate advisory, unreachable path | low | ✅ npm override (2A) |
  | typescript | 5.9.3 | **6.0.3** | — | medium | ✅ upgraded (2B). 7.0.2 trialled: works with Next, but typescript-eslint refuses TS 7 → would break lint. Revisit when typescript-eslint supports it. |
  | eslint | 9.39.5 | 9.39.5 | — | high | ❌ held. ESLint 10 trialled: eslint-plugin-react (inside eslint-config-next) crashes. Revisit with next eslint-config-next. |
  | @prisma/client / prisma | 5.20.0 | **7.10.0** | v5 unsupported | high | ✅ upgraded (2C) — see commit 95b5b6c for full migration + verification. npm's `latest` tag on `prisma` points at 8.0.0-rc.17 (a release candidate) — deliberately not used. |
  | deepmerge-ts, mysql2 (via Prisma 7 CLI) | 7.1.5, 3.15.3 | 8.0.2, 3.24.4 | 4 high advisories, build-time only | low | ✅ npm overrides (2C) |
  | @types/node | 20.x | 20.x | types only | — | ⏸ held: should match the Node version Vercel runs, which can't be checked from here (see Phase 7). |
  | bcryptjs, jose, @vercel/blob, exceljs, tiptap, dxf-parser, obscenity | current | current | — | — | no action needed |

  Result: `npm audit` → **0 vulnerabilities** (was 2 moderate).
  Also: `npm run lint` now exits 0 (vendored `.claude/**` scripts and the
  generated Prisma client excluded).

## Phase 3 follow-up fixes (after the first audit commit)

- **H1** (`0cf5c4f`): the rate limiter moved from memory into Postgres
  (`RateLimitBucket`, one atomic `INSERT … ON CONFLICT … RETURNING`), so
  limits hold across serverless instances. Verified with two server
  processes sharing one budget.
- **M1 + M3** (`a0b4aae`): `proxy.ts` sends every private vendor page to
  login unless the session cookie is valid. `safeInternalPath()` closes the
  login `?next=` open redirect (`/%5Cevil.com`).
- **C1** (this commit): production refuses the sandbox gateway's online
  checkout, and admins record offline payments (bank transfer, cash, card
  terminal) with a server-computed amount, the Event Terms gate, the shared
  `finalizeBoothSale` transaction and an append-only `PaymentEvent` audit
  log. `ALLOW_SANDBOX_PAYMENTS=true` restores online sandbox checkout on a
  deployment where fake payments are acceptable. The owner chose this
  option. Migration `20260925045900_payment_method_and_audit_log` only adds
  things: two nullable columns plus one new table.
  - **Operational note for DAH**: vendors now wait for DAH to collect
    payment manually, and their booth is held only until the acceptance
    deadline (default 3h, Admin → Settings). Raise that default, or use
    "Extend" on the application, while payments are collected offline.

## Phase 4 — authentication

- **Active sessions** (`9585ef1`): VendorSession/AdminSession gained
  `userAgent` + `lastSeenAt` (additive migration `…_session_device_info`).
  Vendor Profile → Active Sessions and Admin Settings → Active admin
  sessions list each device ("Safari on iPhone", last active) with
  per-device sign-out and "sign out all other devices". No IP address is
  stored or shown. Tested 12/12 (including cross-vendor revoke refused)
  plus a browser check.
- **Sign in with Google** (this commit): OIDC authorization code + PKCE +
  state + nonce. The ID token is verified against Google's JWKS (issuer,
  audience, expiry, nonce). New `VendorIdentity` table (additive migration
  `…_vendor_identity`).
  - Linking happens only from a signed-in vendor's Profile. "Continue with
    Google" on the login page works only for an already-linked account. It
    never creates an account and never matches by email, so there are no
    duplicate identities and no takeover through a matching email. A
    Google account linked to one vendor is refused for any other (unique
    index, too).
  - Unlink from Profile at any time; passwords are unchanged, so nobody
    can be locked out. Closing or permanently deleting an account removes
    the link.
  - Tested 22/22 against a local fake OIDC issuer: forged state, replayed
    callback, wrong nonce, PKCE, user cancel, closed account, open-redirect
    `next`, cross-vendor link. Also a browser walk-through, and a
    production build confirming the feature is off without credentials and
    that the test-issuer switch is ignored in production.
  - **BLOCKED EXTERNAL STEP**: create the Google OAuth client and set
    `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` in Vercel (steps in
    `.env.example`). Until then nothing Google-related is visible.
- Not changed, deliberately: passwords (bcrypt 12), the 60-day vendor and
  12h admin session lifetimes, and phone-only verification for applying
  to events. Email verification stays optional, as instructed.

## Phase 5 — legal pages CMS

- Admin → Content → **Legal Pages** manages the public Privacy Policy,
  Terms & Conditions and Refund & Cancellation Policy (`/legal/*`). Each
  has a draft, preview, publish and full version history.
- Reuses the Agreement table's draft/publish/version engine under three
  new type values (`PRIVACY_POLICY`, `WEBSITE_TERMS`, `REFUND_POLICY`). No
  schema change or migration was needed. These documents are never
  "accepted", so they are separate from Signup Terms and per-event Vendor
  Event Terms, which keep their own pages, acceptance tracking and payment
  gate unchanged.
- Until a version is published, each page shows the text it showed before
  (moved into `lib/legalDocs.ts`), so nothing changes on the live site
  until an admin publishes. The first draft starts from that text.
  Published pages show "Last updated". All HTML goes through the existing
  sanitizer (`sanitizeAgreementHtml`).
- Tested 20/20: default text, draft not public, publish replaces page,
  script/`onerror`/`javascript:` stripped, v2 archives v1, discard, other
  pages and vendor terms unaffected, admin auth. Browser check on desktop
  and mobile.

## Phase 6 — payment architecture

Full write-up: `docs/PAYMENTS.md`.
- **Lifecycle:** `lib/paymentLifecycle.ts` defines the state machine
  (CREATED / PENDING / AUTHORIZED / SUCCEEDED≡PAID / FAILED / CANCELLED)
  and the 8-state vocabulary (adds REFUNDED / PARTIALLY_REFUNDED).
  Every write is a guarded conditional update. The stored `SUCCEEDED`
  was kept on purpose: 33 files and existing production rows depend on it.
- **Provider interface:** `payments/gateway.ts` gained `getPaymentStatus`,
  `verifyWebhook`, `refund` and `returnUrl`/`redirectUrl`. All are
  INTEGRATION POINTs; none is faked.
- **Webhook:** `/api/webhooks/payments/[provider]` does signature checks
  via the gateway, event-id idempotency (`PaymentWebhookEvent`), an exact
  amount/currency check and guarded transitions.
- **Reconciliation and return page:** `lib/paymentProcessing.ts` does
  reconciliation (cron) and on-demand refresh. The return page
  `/vendor/payments/return/[id]` handles success / failure / cancel /
  pending / needs-review states and never trusts query parameters.
- **Checkout start:** now creates the Payment first (CREATED), calls the
  provider outside the transaction, and rolls the booths back to REVIEW if
  the provider call fails.
- **Refunds:** `PaymentRefund` plus `Payment.refundedAedFils`, capped
  atomically. Refunds go through the provider when supported, otherwise
  are recorded by hand. A refund never unbooks.
- **Needs attention:** `Payment.needsAttention` catches paid-after-lapse,
  paid-after-failed and amount mismatches, with an admin "Mark resolved"
  plus note.
- **Admin UI:** payment cards on the application page (lifecycle, refunds,
  attention, history). Payment lists show lifecycle and attention badges;
  the event payments page shows a Refunded total.
- **Migration:** `…_payment_lifecycle_refunds_webhooks` only adds things:
  two columns (one `NOT NULL DEFAULT 0`) and two tables.
- **Tests:**
  - LIVE path via the dev-only `local-test` stand-in: 34/34.
  - Sandbox mode: 34/34.
  - DISABLED mode on a production build: 28/28.
  - A production build refuses `local-test`: webhook and dev routes 404.
  - Browser check of the admin card and the return page.

## Phase 7 — deployment

- **Fixed:** migrations ran on every Vercel build, including Preview
  builds of unmerged branches. That could change the production schema
  before review whenever Preview shares the production database.
  `scripts/build.mjs` now migrates only on Vercel Production, non-Vercel
  builds, or Preview with `MIGRATE_ON_PREVIEW=true`. Tested with a
  4-scenario dry run, and a failing migration still fails the build.
- **Added:** `GET /api/health` (DB reachability, no config exposed) for
  uptime monitoring; `.nvmrc` = 22.
- `docs/DEPLOYMENT.md` covers services, env vars per environment, build
  and migration policy, the Vercel settings to confirm (Node 22, region
  next to the DB, cron plan limits, Preview protection, rollback), domain
  and DNS steps, and a launch-day checklist. README deploy section now
  points there (the old text advised giving Preview the same variables as
  Production).
- **BLOCKED EXTERNAL STEPS:**
  - Vercel dashboard checks: build command override, Node version, region,
    plan (the hourly cron needs Pro), Preview database isolation.
  - Registrar DNS, and the Resend, Infobip and Google console URLs.

## Phase 8 — SEO

- **Private pages:** `/vendor/*` and `/admin/*` layouts set
  `noindex, nofollow`. robots.txt disallows `/admin`, `/api/` and
  `/vendor/`, while the public `/vendors` and `/vendor-terms` stay
  crawlable.
- **Preview deployments:** fully `noindex` and disallowed
  (`isIndexableDeployment`).
- **Canonical URLs:** on all public pages (home, events, event detail,
  vendors, gallery, contact, vendor terms, legal). The home page uses the
  full site title rather than "Home — …".
- **Structured data:** Organization JSON-LD (with Instagram from Settings)
  on the home page, schema.org Event JSON-LD on event pages. `<` is
  escaped so admin text can't break out of the script tag.
- **Sitemap:** adds `/vendor-terms`; legal pages carry `lastModified` from
  their published versions.
- **Search Console:** optional `GOOGLE_SITE_VERIFICATION` meta tag; DNS
  verification is recommended.
- **Verified on a production build:** robots, sitemap, canonicals, JSON-LD
  parse, noindex on a vendor page, verification meta. The indexability
  matrix was checked for prod, Vercel prod, preview and dev.
- **BLOCKED EXTERNAL STEP:** create the Search Console property and submit
  the sitemap (steps in `docs/DEPLOYMENT.md`).

## Phase 9 — developer standards

- **README.md** rewritten to match what the site does today. The old one
  described SQLite, email-gated vendors and a TODO sandbox. Details moved
  into linked docs.
- **docs/DEVELOPMENT.md:** local setup, test accounts (manual phone
  verification locally), payment modes, checks, troubleshooting. The
  troubleshooting covers the gotchas found in this project: stale
  `.next/dev` cache, `next typegen`, the local rate limiter, Prisma 7
  import path.
- **CONTRIBUTING.md:** workflow, conventions, database-migration rules,
  and the non-negotiable rules (money, no fake integrations, secrets,
  authorisation, verification policy, no caching of booking state,
  sanitised HTML).
- **Scripts:** `typecheck`, `check` (lint + typecheck) and `test` (Node's
  built-in runner via tsx, no new dependency).
- **Unit tests:** `tests/*.test.ts`, 15 passing. They cover the payment
  lifecycle, open-redirect guard, JSON-LD escaping, indexability, device
  labels, payment labels, booth fit, usernames and legal doc slugs.
- **Formatting:** `.editorconfig` only. Prettier was deliberately **not**
  adopted: measured, it would rewrite 176–283 of 371 source files
  depending on line width, which is the repo-wide churn the brief rules
  out.

## Phase 10 — design system

- **Audit:** semantic colour tokens with dark-mode values are already in
  place (`globals.css`). `Button` was used in 46 files. Raw hex exists
  only in the floor-plan SVG drawing and the Google mark (both
  legitimate).
- **Consistency fix:** the last 9 hand-styled pill buttons now use
  `Button` with the right variant and built-in loading states. That's the
  admin application page (approve/reject/re-accept/resend/extend/revoke/
  adjustment), the offline-payment and payment-record cards, the event
  form, the agreements search and the vendor multi-booth staging. The
  sandbox checkout buttons are intentionally left alone. Browser-checked.
- `docs/DESIGN_SYSTEM.md` documents tokens, typography, layout, the
  component catalogue, interaction rules and deliberate exceptions.

## Phase 11 — data tables and data fetching

- **Caching audit:** nothing uses `"use cache"`, `unstable_cache` or ISR.
  Every page that reads the database is dynamic. Added
  `Cache-Control: private, no-store` to all `/api/*` responses so live
  booth, payment and session state can never be stored by a browser or
  proxy. The sitemap was frozen at build time; it now refreshes hourly.
  Rules are in `docs/DATA_FETCHING.md`.
- **Bug fixed:** the Communications → Compose manual vendor search called
  `/api/admin/vendors`, which doesn't exist, so it always showed no
  results. It has done this since Communications shipped. It now uses
  `/api/admin/vendors/search`.
- **Payment tables:** new `lib/paymentFilters.ts` is the single filter
  definition for All Transactions, the per-event table and the CSV/Excel
  export. This fixed three things:
  - Exports now match the screen. Before, the per-event export ignored
    the contact and email search.
  - The status filter now covers every lifecycle state, plus Refunded and
    Needs attention.
  - Dates are Dubai calendar days. Malformed dates used to cause a 500.

  Search also covers receipt numbers and references. All Transactions
  shows "N of M" when capped, and the export refuses rather than silently
  truncating. The per-event "Pending" tile now counts
  created/pending/authorised ("In progress").
- **Emails log:** it showed only the latest 150 of (locally) 480 sends,
  so older failed emails couldn't be found or retried. Server-side status
  and search filters now reach any delivery. Communications history
  shows its cap when reached.
- Tests:
  - `tests/paymentFilters.test.ts`: 5 new unit tests (20 total).
  - A DB check found server `where` and client predicate identical across
    210 filter combinations.
  - Browser: on-screen counts equal export row counts for 6 filter
    sets.

## Phase 12 — UX / performance

Measured on a local production build, emulating a mid-range phone (390 px,
4× CPU slowdown, 9 Mbps, 150 ms RTT):

| Pages | LCP | CLS | JS (first visit) |
|---|---|---|---|
| Public: home, events, event detail, gallery, vendors, contact, legal, login | 0.6–0.7 s (warm) | 0 | ~155 KB |
| Vendor: dashboard, applications, booking, payments, profile | 0.4–0.8 s | 0 | ~165 KB, then cached |
| Admin: overview, lists, event workspace with floor-plan builder | 0.45–0.7 s | 0 | ~150 KB, plus ~163 KB for the builder |

Changes:
- **Fonts:** the Arabic font (Cairo) was preloaded on every English page
  and never used: 4 font files, about 138 KB. It now loads only when the
  page is in Arabic, so English pages fetch 2 files (about 75 KB).
  Verified that Arabic pages still switch to RTL and render Cairo.
- **Accessibility (axe-core, WCAG 2 A/AA + best practice, 22 pages):**
  - Before: 578 contrast failures across 22 pages plus 6 other issue
    types. After: **0 violations**.
  - The secondary-text token `brown-light` went from #7a6c55 (4.1:1 on
    cream, below AA) to #675944 (4.6–6.2:1 on every cream surface). It
    reads as the same warm brown, slightly deeper. Dark mode already
    passed.
  - Headings on the vendor dashboard are now in order.
  - Navigation landmarks have distinct labels ("Main", "My DAH").
  - The vendor sort control has a label, and the email table's actions
    column has screen-reader text.
  - The admin login page has a `<main>` landmark.

## Phase 13 — floor-plan regression protection

`tests/floorplan.test.ts` has 14 tests that lock down the geometry every
floor-plan surface shares:
- the viewBox choice (real mm vs legacy percentages) and mm↔grid
  round-trips;
- `worldRectOf`, and patch field-naming (an mm value is never sent as
  `gridX`);
- uniform background scaling and two-point calibration;
- boundary containment for rectangles (including rotation), circles, ovals
  and a concave polygon notch, plus boundary JSON parse/serialize;
- booth fit, multi-booth caution and adjacency;
- the JSON layout importer;
- the CAD (DXF) importer, using the fixture `tests/fixtures/two-booths.dxf`.

Two real bugs were found and fixed while writing these tests. Each has a
test that fails on the old code:
- **CAD import mirrored drawings top-to-bottom.** DXF is y-up and the
  floor plan is y-down, and the importer never flipped the axis. Booths,
  walls and outline were all mirrored, and rotation angles had the wrong
  sign. Coordinates are now converted as they're read (`fromDxf`).
  - Already-committed layouts are **not** changed.
  - Re-importing a DXF into an event that was imported before this fix
    will preview the correct (flipped) orientation, so check the preview
    before committing.
- **Adjacency for 90°/270°-rotated booths used the wrong edges.** Booths
  rotate about their centre, but the check kept the original top-left.
  This only affected the vendor-facing "are these booths next to each
  other" message for rotated, non-square booths.

Browser check on a production build: the real CAD parse endpoint returns
the corrected orientation, and the admin builder renders all 24 booths of
the test event with no page errors.

`npm test` now loads `tests/setup.cjs`, which maps `server-only` to an
empty module so server libraries can be unit-tested outside Next.

## Phase 14 — WhatsApp/Infobip regression protection

- **End-to-end (`tests/e2e/whatsapp-otp.e2e.ts`, 30 checks, all pass).**
  It drives the real send/confirm routes of a production build pointed at
  a local fake Infobip (`tests/e2e/fake-infobip.mjs`), and verifies:
  - the exact payload Infobip receives: `App` key auth, the configured
    sender, recipient in E.164 without `+`, the configured AUTHENTICATION
    template, and the 6-digit code as both body placeholder and Copy Code
    button;
  - storage: only a 64-hex HMAC is stored (not the code, not a bare
    SHA-256);
  - limits: the resend cooldown, the 5-attempt cap, and that an old code
    stops working after a resend;
  - success: the vendor is verified for that exact number with method
    WHATSAPP, and an audit-log row is written; an already-verified vendor
    can't trigger a send;
  - failure: when the provider fails and echoes the payload, the result is
    FAILED and the code is redacted;
  - no OTP code or API key appears in the server log.
- **Every `npm test`** (`tests/whatsapp.test.ts`) also checks:
  - no SMS SDK, no `lib/sms`, and no Twilio or SMS endpoint in code;
  - client components read only `NEXT_PUBLIC_*` env vars, and nothing
    secret is `NEXT_PUBLIC_`;
  - the Infobip modules are `server-only`;
  - E.164 normalisation, and that changing the phone un-verifies;
  - the template payload shape.
- Email verification remains optional; phone verification remains the
  apply gate. Neither was changed.
- Noted, not changed: a UAE landline (04…) passes phone validation but
  can't receive WhatsApp. Such a vendor just won't receive the code.
  Restricting signup to mobile numbers would be a product decision.

## Current

Phase 15 — database/migration safety review.

## Remaining (high level)

See `docs/PHASE_0_AUDIT.md` and `docs/SECURITY_AUDIT.md` for the detailed
findings driving Phases 1–17.

## Blockers (external, cannot be resolved from inside this environment)

- **Vercel account access** — no Vercel CLI session is authenticated in this
  environment (`vercel whoami` → logged out). Phase 7 (deploy investigation)
  needs the user to either share the Vercel project's dashboard settings, or
  run diagnostic commands themselves and paste output back.
- **Google OAuth credentials** — Phase 4's OAuth work needs a Google Cloud
  OAuth client ID/secret from the user before it can be wired to real
  sign-in (the code path can be built up to that boundary).
- **Live payment gateway credentials/docs** — Phase 6 needs the bank's actual
  gateway API docs and credentials before a real provider adapter can be
  written. Provider-neutral infrastructure will be built up to that boundary.
- **Google Search Console account** — Phase 8's submission step needs the
  user's own Search Console access; the technical SEO work (sitemap, robots,
  metadata) does not.
- **Domain registrar / DNS access** — Phase 7's final domain configuration
  needs the user's registrar/DNS access.

Each blocker above will be called out again, explicitly, as **BLOCKED
EXTERNAL STEP**, when its phase is reached — the plan is to keep working
unrelated phases rather than stopping entirely.
