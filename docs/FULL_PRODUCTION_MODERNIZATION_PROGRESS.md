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
| 2 | Dependency audit + controlled upgrades | ⏳ Not started (facts gathered in Phase 0 audit) |
| 3 | Complete security audit | 🟡 In progress — `docs/SECURITY_AUDIT.md` written; 2 of ~6 actionable findings fixed |
| 4 | Auth modernization + active sessions + OAuth | ⏳ Not started |
| 5 | Legal content CMS | ⏳ Not started |
| 6 | Live payment gateway architecture | ⏳ Not started |
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

## Current

Phase 2 — dependency audit and controlled upgrades (patch/minor group first,
Prisma major jump isolated as its own slice).

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
