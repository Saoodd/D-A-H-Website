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
| 5 | Legal content CMS | ⏳ Not started |
| 6 | Live payment gateway architecture | ⏳ Not started (groundwork from the C1 fix: `lib/bookingPayment.ts`, `PaymentEvent` audit log, `lib/paymentMode.ts`) |
| 7 | Vercel/deployment + domain audit | ⏳ Not started (no Vercel account access in this environment — will need user-provided info) |
| 8 | SEO / search visibility | ⏳ Not started (robots.ts/sitemap.ts/manifest.ts already exist — gaps found, see audit) |
| 9 | Developer standards | ⏳ Not started |
| 10 | Design system / component library | ⏳ Not started |
| 11 | Data table modernization + data fetching | ⏳ Not started |
| 12 | UX / performance audit | ⏳ Not started (prior session already did a large UX pass — see git log) |
| 13 | Floor-plan regression protection | ⏳ Ongoing discipline, re-run after every relevant change |
| 14 | WhatsApp/Infobip regression protection | ⏳ Ongoing discipline, re-run after every relevant change |
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

## Current

Phase 5 — admin-managed legal pages (Privacy / Terms / Refund) with
draft, preview, publish and version history.

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
