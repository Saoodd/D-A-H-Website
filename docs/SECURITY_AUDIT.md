# Security Audit — DAH Events Platform

Conducted as Phase 3 of the production-hardening task, building directly on
the Phase 0 architecture audit (`docs/PHASE_0_AUDIT.md`). Findings gathered
via direct code review plus three focused research passes (auth/session,
payments/webhooks, uploads/secrets/headers). Every finding below cites exact
files; severities are CRITICAL / HIGH / MEDIUM / LOW / OPTIONAL.

**Fix status legend**: ✅ Fixed this session · 🟡 Documented, deferred to a
later phase (with reason) · ⚪ No fix needed (reviewed, sound as-is).

---

## CRITICAL

### C1 — Payment confirmation has no independent (webhook/provider) verification
**Files**: `payments/gateway.ts`, `app/api/checkout/[applicationId]/confirm/route.ts`
**Status**: 🟡 Deferred to Phase 6 (architectural — cannot be patched in place)

There is no real payment gateway today — `payments/gateway.ts` only
implements `SandboxGateway`, entirely in-memory, with `handleWebhook()`
stubbed to always return `null`. `app/api/checkout/[applicationId]/confirm
/route.ts` reads `{ paymentId, outcome }` directly from the authenticated
vendor's own POST body and treats `outcome` as authoritative (lines ~31-36,
~63). The route does layer real, meaningful re-checks around this — the
booth hold must still be valid/unexpired, the payment must still be PENDING,
and the booth-SOLD + payment-SUCCEEDED + receipt-number writes are atomic in
a single `$transaction` with count-based TOCTOU guards — but none of those
checks verify that money actually moved, because in sandbox mode none ever
does.

**Exploit scenario (today)**: an authenticated vendor could POST
`{paymentId, outcome:"SUCCEEDED"}` directly (bypassing the UI) and get a
booth marked sold without a real charge — but there is no real charge to
bypass yet, so this has no financial impact in the current sandbox state.

**Why CRITICAL anyway**: the exact code pattern (trust a client-supplied
outcome) is the single most dangerous thing to carry unchanged into a live
gateway. The code is self-aware of this — see the TODO comment at
`confirm/route.ts` around line 14-17 stating outcome will be driven by a
real webhook once a live gateway exists.

**Fix**: Phase 6 replaces the client-supplied `outcome` with (a) a
provider webhook that independently confirms the charge server-to-server,
signature-verified, and/or (b) a server-side poll of
`gateway.confirmPayment(providerRef)` against the provider's API before
ever marking `Payment.status = PAID`. The existing transaction/TOCTOU
scaffolding in `confirm/route.ts` is sound and should be preserved — only
the trust source for "did it succeed" changes.

---

## HIGH

### H1 — Rate limiting is in-memory, not safe across serverless instances
**File**: `lib/rateLimit.ts`
**Status**: 🟡 Deferred — remediation path documented, not implemented this session

Pure in-memory `Map`, explicitly self-documented in the file's own comment
as a "soft limit" on multi-instance deployments. Affects every consumer:
admin login (8/10min), vendor login, register, forgot/reset-password,
phone/email verification send/confirm, upload-signup. On Vercel, each
lambda instance (and every cold start) gets its own empty map, so an
attacker spreading requests across instances/regions can exceed the
nominal limit.

**Recommended fix**: back the limiter with Postgres (already provisioned —
no new external credential needed) via a small `RateLimitBucket` table and
an atomic `UPSERT ... ON CONFLICT DO UPDATE` incrementing a counter with a
window-reset check, keeping `rateLimit()`'s existing signature so none of
its ~10 call sites need to change. This is real, scoped work (new table +
migration + swap the function body) best done as its own tested slice in a
Phase 2/3 continuation, not a rushed inline edit — flagged rather than
rushed.

**Secondary note**: `clientIp()` trusts `x-forwarded-for`/`x-real-ip`
directly with no allowlist of trusted proxy hops. On Vercel specifically
this header is set reliably by Vercel's own edge network, so this is lower
risk in the actual deployment target than in general — but worth revisiting
if the app is ever placed behind another proxy layer.

---

## MEDIUM-HIGH

### M1 — Vendor route protection is convention-based, not structural
**Files**: `app/(site)/vendor/*` (no shared protected layout, unlike admin)
**Status**: 🟡 Deferred to Phase 4 (folder restructure, needs its own tested slice)

See `docs/PHASE_0_AUDIT.md` §3 for full detail. Every current vendor page
correctly checks `getVendorSession()`, but nothing in the framework enforces
this for a *future* page the way `app/admin/(protected)/layout.tsx` does for
admin. Recommended fix (restructuring into `(public)`/`(protected)` route
groups) is real, file-path-changing work that needs careful regression
testing across every vendor link/redirect — scheduled into Phase 4 rather
than done as a drive-by change here.

---

## MEDIUM

### M2 — Infobip WhatsApp webhook had no signature/secret verification
**File**: `app/api/webhooks/infobip-whatsapp/route.ts`
**Status**: ✅ **Fixed this session**

The route parsed and trusted any POST body with zero authentication —
anyone who discovered the URL could POST arbitrary delivery-status updates
and corrupt `WhatsAppDelivery` records (bookkeeping only, not auth/payment
data, so blast radius was limited, but still a real gap). Infobip has no
documented HMAC/signing scheme we could confirm without their docs (already
noted in the code's own honesty comment).

**Fix applied**: added a shared-secret check (`INFOBIP_WEBHOOK_SECRET`,
compared with `crypto.timingSafeEqual`, same pattern as the existing
`CRON_SECRET` check in `app/api/cron/notifications/route.ts`). Fails closed
if the env var is unset. New env var documented in `.env.example` with
instructions to append `?secret=<value>` to the DLR callback URL configured
in the Infobip portal.

**Remaining manual step for the user**: generate a value (e.g. `openssl
rand -base64 32`), set `INFOBIP_WEBHOOK_SECRET` in both `.env`/Vercel env
vars and in the Infobip dashboard's configured callback URL. Until that's
done, the route now correctly rejects all delivery-report callbacks
(fail-closed) rather than silently accepting unsigned ones — verify this is
configured before relying on delivery-status accuracy in production.

---

## LOW

### L1 — `vendor/register` leaks account-enumeration info
**File**: `app/api/vendor/register/route.ts` (~lines 83-96)
**Status**: 🟡 Noted, not changed — product decision, not a bug

Returns an explicit "An account already exists for this email. Please log
in instead." (409) on duplicate email, and a similar message for a taken
username. This contrasts with `login`/`forgot-password`, which are
deliberately enumeration-safe (generic messages regardless of whether the
account exists). This is a common, often intentional UX tradeoff for
registration flows (immediate, helpful feedback vs. enumeration
resistance) — left as-is since changing it is a product/UX call, not a
clear security bug. Flagging so the decision is visible, not silent.

### L2 — `$queryRawUnsafe` used for a non-interpolated query
**File**: `lib/receipts.ts`
**Status**: ✅ **Fixed this session**

`assignReceiptNumber()` used `db.$queryRawUnsafe(...)` for `SELECT
nextval('"ReceiptNumberSeq"')`. The query string had zero interpolated
values (a fixed literal), so this was **not an active SQL-injection
vulnerability** — but using the "Unsafe" API surface for a query that
doesn't need it is unnecessary risk if the code is ever modified later.
Swapped to the parameterized `$queryRaw` + `Prisma.sql` tagged template as
defense-in-depth. Verified via `tsc --noEmit` and `eslint` — clean.

---

## Reviewed and found sound (⚪ no fix needed)

- **Session/auth core** (`lib/auth.ts`) — `jose`-signed JWTs carrying only a
  DB-row session ID (hybrid model, not pure stateless JWT); `VendorSession`/
  `AdminSession` tables back real revocation, checked on every request;
  cookies are `httpOnly`, `sameSite: lax`, `secure` in production;
  `invalidateAllVendorSessions()` is called on password reset (bulk
  compromise-response). bcryptjs cost factor 12. `verifyPasswordOrDummy()`
  runs a dummy bcrypt compare on unknown accounts for timing-safety.
- **Admin login** (`app/api/admin/login/route.ts`) — constant-time password
  compare (`crypto.timingSafeEqual`), zod-validated, rate-limited
  (8/10min/IP — see H1 for the underlying limiter's own caveat).
- **WhatsApp OTP** (`lib/whatsapp/otp.ts`) — code generated via
  `crypto.randomInt`; hashed with **HMAC-SHA256 keyed with `AUTH_SECRET`**
  (not a bare hash — resists offline brute-force of the 1M-value 6-digit
  space from a DB leak alone); compared with `crypto.timingSafeEqual` and a
  fail-closed length check; 10-minute expiry; 5-attempt cap; a fresh send
  invalidates the previous code.
- **Password-reset / email-verification tokens** (`lib/tokens.ts`) —
  `crypto.randomBytes(32)`, only a SHA-256 hash persisted (raw value only
  ever emailed), single-use enforced by callers via `usedAt`.
- **IDOR** — sampled 4 representative ID-bearing vendor routes (booth hold,
  checkout start, warning acknowledge); all verify resource ownership
  against the session vendor before acting, all correctly return 404 (not
  403) on mismatch to avoid confirming another vendor's resource exists.
- **Booth-hold race safety** — both hold routes use a conditional
  `updateMany` (`WHERE status = 'AVAILABLE' OR heldByApplicationId = ...`)
  rather than read-then-write; Postgres row-locking during the `UPDATE`
  makes two concurrent holds of the same booth structurally impossible, not
  just improbable.
- **Checkout pricing** — server always re-derives price/VAT/total from DB
  (`getBoothPrice`) in `checkout/[applicationId]/start`; the client's
  request body plays no role in pricing at all.
- **Receipt-number atomicity** — a real Postgres `SEQUENCE`
  (`ReceiptNumberSeq`), assigned via `nextval()` inside the same
  transaction as the SOLD/SUCCEEDED writes; idempotent (returns existing
  number if already assigned). Not an app-level max+1 pattern (which would
  be racy).
- **Cron secret** (`app/api/cron/notifications/route.ts`) — fails closed if
  `CRON_SECRET` unset; correctly compares the `Authorization: Bearer` header.
- **Uploads** (`lib/uploadSafety.ts`, per-route) — magic-byte content
  sniffing in addition to client-declared MIME type; server-enforced size
  caps (10-15MB depending on route); filenames always replaced with
  `randomUUID()`, never derived from client input; trade licenses go to a
  **private** Blob store and are served through an access-controlled proxy
  route (`app/api/vendor/documents/trade-license/route.ts`) that resolves
  the document from the session vendor, never a client-supplied ID or a
  public Blob URL.
- **Secrets exposure** — the only `NEXT_PUBLIC_` var in the entire codebase
  is `NEXT_PUBLIC_SITE_URL` (not sensitive). Every real secret
  (`ADMIN_PASSWORD`, `AUTH_SECRET`, `CRON_SECRET`,
  `RESEND_WEBHOOK_SECRET`, `INFOBIP_WHATSAPP_API_KEY`, `RESEND_API_KEY`,
  Blob tokens) is referenced only from server-only code, never a `"use
  client"` file, never embedded in a response body or component prop.
- **CSP / `connect-src 'self'`** — no client component makes a `fetch()` to
  an external absolute URL that the current CSP would need to special-case;
  every client fetch is same-origin.
- **Resend webhook signature verification**
  (`app/api/webhooks/resend/route.ts`) — real Svix-style HMAC-SHA256
  verification with a 5-minute replay-tolerance window and
  `timingSafeEqual` comparison. Correctly no-ops (doesn't trust unsigned
  payloads) if `RESEND_WEBHOOK_SECRET` is unset.
- **HTML sanitization** — every `dangerouslySetInnerHTML` call site that
  renders DB-sourced content routes through `lib/sanitizeHtml.ts`'s
  DOMPurify wrapper with a tight tag/attribute allowlist. The one
  unsanitized call site (`app/layout.tsx`, the theme-flash-prevention
  script) is a hardcoded static script, not user/DB input — correctly
  doesn't need sanitizing.
- **SQL injection surface** — only one raw-SQL call in the entire codebase
  (`lib/receipts.ts`, see L2), now fixed to use the parameterized API. No
  other `$queryRaw`/`$executeRaw` usage anywhere.
- **Expiry enforcement** (`lib/expiry.ts`) — `runExpiryPass()` (sweeping
  both expired booth holds and expired application acceptances) is called
  at the top of every route that reads/writes booth or application state
  before it acts, plus a backstop hourly cron run. One area flagged for a
  quick follow-up check (not confirmed line-by-line in this pass): whether
  every **read-only** display route (e.g. the floor-plan GET endpoints)
  also sweeps before displaying status, or only the write-path routes.
  Worth a 15-minute grep-and-confirm in Phase 13 (floor-plan regression
  pass) rather than a blocking finding here.

---

## Summary table

| ID | Severity | Finding | Status |
|---|---|---|---|
| C1 | CRITICAL | Payment confirm trusts client outcome, no webhook | 🟡 Phase 6 |
| H1 | HIGH | In-memory rate limiter, not multi-instance safe | 🟡 documented, path defined |
| M1 | MEDIUM-HIGH | Vendor routes lack structural auth gate | 🟡 Phase 4 |
| M2 | MEDIUM | Infobip webhook unauthenticated | ✅ Fixed |
| L1 | LOW | Register endpoint enumerates accounts | 🟡 product decision, noted |
| L2 | LOW | Non-parameterized raw SQL (no actual injection) | ✅ Fixed |

Everything else audited across authentication, sessions, OTP, IDOR,
booth-hold concurrency, checkout pricing, receipts, uploads, secrets, CSP,
webhook signing (Resend), and HTML sanitization came back sound with no
action needed.
