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

## Current

Phase 3 continuation — H1 (rate limiting not shared across serverless
instances).

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
