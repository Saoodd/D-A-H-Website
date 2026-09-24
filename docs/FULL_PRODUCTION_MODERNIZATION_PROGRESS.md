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
| 1 | Local development environment | ⏳ Not started |
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

## Current

Finishing Phase 0/3 write-up and committing. Next: present audit findings to
the user and get direction on sequencing before undertaking the higher-risk
phases (auth framework migration, payment architecture, dependency major
upgrades, vendor route restructure) — per this task's own "measure twice"
instruction and the standard practice of confirming before hard-to-reverse
changes.

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
