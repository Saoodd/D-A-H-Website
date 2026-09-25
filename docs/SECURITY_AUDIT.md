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
**Status**: ✅ Mitigated in production (online checkout disabled, admin-recorded payments) · 🟡 real gateway integration still Phase 6

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

**Exploit scenario (before the mitigation)**: an authenticated vendor could
POST `{paymentId, outcome:"SUCCEEDED"}` directly, or just click "Pay with
card" in the UI. On the production site this sold a real booth, issued a
real receipt number and sent "payment received" email/WhatsApp messages,
with no money collected. Production ran the sandbox gateway (no
`PAYMENT_PROVIDER` set), so this was a live business risk, not a
theoretical one.

**Interim mitigation (implemented, owner-approved)**: `lib/paymentMode.ts`
decides whether online checkout is allowed. A production build running
the sandbox gateway is `DISABLED` unless `ALLOW_SANDBOX_PAYMENTS=true` is
set deliberately:
- `checkout/start` returns 503 `ONLINE_PAYMENT_UNAVAILABLE` before
  creating any charge or Payment row. The booth stays in its REVIEW hold
  until the acceptance deadline, and the vendor sees "DAH will contact you
  to arrange payment" in place of the pay buttons.
- `checkout/confirm` refuses every call in any mode except `SANDBOX`, so
  no client-chosen outcome can resolve a payment in production. The same
  applies to a future `LIVE` mode, which must confirm payments through the
  provider.
- Admins confirm bookings with **Record offline payment** on the admin
  application page (`POST /api/admin/applications/[id]/offline-payment`,
  `lib/offlinePayment.ts`). The server prices the held booths itself, the
  request must echo that exact total back, and the Event Terms gate still
  applies. The booth sale runs through the same `finalizeBoothSale`
  transaction as online checkout (`lib/bookingPayment.ts`), and any stale
  PENDING online payment is marked FAILED and logged as SUPERSEDED.
- Every payment state change is appended to `PaymentEvent`: CREATED,
  SUCCEEDED, FAILED, OFFLINE_RECORDED and SUPERSEDED, with the actor
  (VENDOR/ADMIN).
- Verified with an e2e run against a dev server (32/32), a production
  build in DISABLED mode (26/26) and a production build with the override
  (32/32), plus a browser walk-through of the vendor notice and the admin
  form.

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
**Status**: ✅ **Fixed** — Postgres-backed, see "Fix applied" below

Pure in-memory `Map`, explicitly self-documented in the file's own comment
as a "soft limit" on multi-instance deployments. Affects every consumer:
admin login (8/10min), vendor login, register, forgot/reset-password,
phone/email verification send/confirm, upload-signup. On Vercel, each
lambda instance (and every cold start) gets its own empty map, so an
attacker spreading requests across instances/regions can exceed the
nominal limit.

**Fix applied**: counters now live in a `RateLimitBucket` Postgres table
(additive migration `20260924232716_rate_limit_bucket` — one new table, no
changes to existing data; no new external service). Each check is one
atomic `INSERT ... ON CONFLICT DO UPDATE ... RETURNING count`, using the
database clock. The resend cooldowns (`peekCooldown`/`armCooldown`) moved
to the same table. The hourly cron purges buckets expired for over a day.
The limiter is now async; all 30 call sites across 16 routes were
converted to `await` — TypeScript did **not** flag an un-awaited
`!rateLimit(...)` (it would silently never limit), so completeness was
verified by grep (zero un-awaited calls remain).

**Verification** (vendor login, limit 10): 12 sequential → 10×401 then
429s; 25 concurrent on one server → exactly 10 allowed; **24 concurrent
split across two separate server processes (dev + production build) sharing
one database → exactly 10 allowed** (the old per-process map would have
allowed 20). Cooldown arm/peek/expiry and purge verified directly.

**Secondary note**: `clientIp()` trusts `x-forwarded-for`/`x-real-ip`
directly with no allowlist of trusted proxy hops. On Vercel specifically
this header is set reliably by Vercel's own edge network, so this is lower
risk in the actual deployment target than in general — but worth revisiting
if the app is ever placed behind another proxy layer.

---

## MEDIUM-HIGH

### M1 — Vendor route protection is convention-based, not structural
**Files**: `app/(site)/vendor/*` (no shared protected layout, unlike admin)
**Status**: ✅ **Fixed** — `proxy.ts`, no files moved

See `docs/PHASE_0_AUDIT.md` §3 for full detail. Every current vendor page
correctly checks `getVendorSession()`, but nothing in the framework enforced
this for a *future* page the way `app/admin/(protected)/layout.tsx` does for
admin.

**Fix applied**: instead of the invasive folder restructure originally
proposed, a Next 16 `proxy.ts` (the renamed middleware) now gates the
private vendor paths — `/vendor/dashboard`, `/applications`, `/payments`,
`/agreements`, `/receipts` (all with sub-paths) and `/vendor/profile`
(exactly: `/vendor/profile/confirm-email` is a public emailed link). It
checks the session cookie's signature, expiry, and shape (a vendor token,
not an admin one) and redirects to `/vendor/login?next=<path>` otherwise.
Per Next's guidance this is an optimistic check only; every page keeps its
full database check (revocation, closed accounts). Cookie names and JWT
helpers moved to a dependency-free `lib/sessionToken.ts` shared by
`lib/auth.ts` and the proxy.

**Verification** (28 cases against the running app): all 10 private paths
redirect without a cookie; all 9 public paths (login, forgot-*,
reset-password, verify/email, profile/confirm-email, public site) are
untouched; forged signatures and admin-shaped tokens are redirected; a real
session gets 200 on every private page; a revoked session still ends at
`/vendor/login` in a real browser (the page's own check, delivered in-band
because those pages stream a `loading.tsx` skeleton).

### M3 — Open redirect via the login `next` parameter
**File**: `app/(site)/vendor/login/page.tsx`
**Status**: ✅ **Fixed**

`safeNext()` accepted any value starting with `/` but not `//`. Browsers
treat `\` as `/` and strip tabs/newlines, so `?next=/%5Cevil.com`,
`/%5C/evil.com` and `/%09/evil.com` all passed the check yet navigated to
`evil.com`.

**Exploit scenario**: a phishing link to the genuine
`…/vendor/login?next=/%5Cevil.com` — the vendor signs in on the real DAH
site, then lands on an attacker's lookalike ("session expired, sign in
again") that harvests their credentials.

**Fix applied**: `safeInternalPath()` in `lib/url.ts` rejects backslashes
and control characters, then resolves the value the way a browser would and
requires the origin to be unchanged. Verified with 13 unit cases and live
against the server with a real session: every payload now redirects to
`/vendor/dashboard`; legitimate deep links (e.g. `/vendor/payments`) still
work. This was the only user-controlled redirect parameter in the app.

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

### L3 — Legacy events published without Event Terms skip the Terms gate
**File**: `lib/agreements.ts` (`hasAcceptedCurrentEventTerms`)
**Status**: 🟡 Noted — data check for the user, no code change

Found during the Phase 2 end-to-end booking test. Checkout requires the
vendor to have accepted the event's *current published* Terms — but when
an event has **no** published Terms at all, the gate passes (documented,
intentional: nothing to accept). That's safe for every event published
today, because `app/api/admin/events/[id]/route.ts` refuses to publish an
event without published Terms, and no code path can remove a published
event's Terms afterwards (drafts are deletable; a published version is
only ever archived atomically when a newer one is published, in
`publishDraft`). The exposure is limited to **events published before that
rule existed**, which can still take payment without any Terms step.

**Check in production** (lists any such events):
```sql
SELECT e.slug FROM "Event" e
WHERE e.status = 'PUBLISHED'
  AND NOT EXISTS (SELECT 1 FROM "Agreement" a
                  WHERE a."eventId" = e.id AND a.type = 'EVENT_TERMS'
                    AND a.status = 'PUBLISHED');
```
If it returns rows, publish Terms for those events in Admin → Event Terms.

### L4 — Viewing a warning is recorded by a GET request
**File**: `app/api/vendor/warnings/[id]/route.ts`
**Status**: 🟡 Noted, not changed

Opening a warning sets `viewedAt` in a `GET` handler. `SameSite=Lax`
cookies *are* sent on top-level cross-site GET navigations, so a link on
another site could mark a vendor's warning "viewed" without them reading
it, slightly weakening that audit trail. Impact is low: it is scoped to the
signed-in vendor's own warnings, and the meaningful action
(*acknowledge*) is a separate `POST`, which cross-site requests can't
trigger. Worth moving to a `POST` if `viewedAt` is ever relied on for
anything consequential.

---

## Reviewed and found sound (⚪ no fix needed)

- **CSRF** — session cookies are explicitly `SameSite=Lax`, so browsers
  don't attach them to cross-site `POST`/`PUT`/`DELETE` requests; every
  state-changing API is a non-GET route. The only GET handlers that write
  are the two floor-plan GETs (they run `runExpiryPass`, an idempotent
  release of already-expired holds — not attacker-directed) and L4 above.
- **CORS** — no `Access-Control-Allow-*` headers anywhere, so other origins
  can't read API responses.

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
| C1 | CRITICAL | Payment confirm trusts client outcome, no webhook | ✅ Mitigated (prod checkout off, offline payments) · 🟡 gateway Phase 6 |
| H1 | HIGH | In-memory rate limiter, not multi-instance safe | ✅ Fixed (Postgres-backed) |
| M1 | MEDIUM-HIGH | Vendor routes lack structural auth gate | ✅ Fixed (proxy.ts) |
| M2 | MEDIUM | Infobip webhook unauthenticated | ✅ Fixed |
| M3 | MEDIUM | Open redirect via login `next` parameter | ✅ Fixed |
| L1 | LOW | Register endpoint enumerates accounts | 🟡 product decision, noted |
| L2 | LOW | Non-parameterized raw SQL (no actual injection) | ✅ Fixed |
| L3 | LOW | Legacy events published without Terms skip the Terms gate | 🟡 data check provided |
| L4 | LOW | Warning "viewed" recorded via GET (cross-site link can set it) | 🟡 noted |

Everything else audited across authentication, sessions, OTP, IDOR,
booth-hold concurrency, checkout pricing, receipts, uploads, secrets, CSP,
webhook signing (Resend), and HTML sanitization came back sound with no
action needed.
