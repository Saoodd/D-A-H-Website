# End-to-end tests

`npm run test:e2e` runs every suite here against real servers:
- a production build (`next start`) and a dev server (`next dev`);
- the **local** database;
- local fakes in place of outside providers, so nothing reaches Infobip,
  Google or a bank.

```bash
npm run test:e2e                  # build, then run all suites (~3 min)
npm run test:e2e -- --skip-build  # reuse the existing .next build
npm run test:e2e -- payments      # only suites whose name matches
```

`scripts/e2e.mjs` starts the fakes and servers with a known configuration,
whatever your `.env` says:
- Infobip points at the fake;
- email sending is off;
- no real Google or payment provider is used.

Each suite creates its own vendors, events and booths, and removes them
afterwards. Every script refuses to run if `DATABASE_URL` isn't a local
database. Don't run it while `npm run dev` is running in this folder.

| Suite | Server | Covers |
|---|---|---|
| `whatsapp-otp` | production | Exact Infobip payload, HMAC-only storage, cooldown, attempt cap, verification + audit log, honest failures, no code/API key in logs |
| `sessions` | production | Device list, revoke one/all others, no cross-vendor access, immediate sign-out |
| `legal-cms` | production | Default text, draft → publish → versions, HTML sanitising, discard. Skips if your DB already has legal docs. |
| `payments-offline` | production | Online payment refused in production (booth stays held); admin offline payment: validation, server-quoted amount, receipt, audit, refunds |
| `payments-live` | dev (`local-test` gateway) | Redirect/return, signed webhooks, replay/stale/forged rejection, amount mismatch, reconciliation, late and lost payments, AUTHORIZED→PAID, refunds incl. concurrent ones |
| `google-signin` | dev (fake OIDC) | No account creation from Google, link only when signed in, no duplicate identities, state/nonce/PKCE/replay, open redirect, closed accounts, unlink |

Fakes: `fake-infobip.mjs` (WhatsApp template list + send) and
`fake-oidc.mjs` (Google `/auth`, `/token`, `/certs`). The app only honours
the fake Google issuer and the `local-test` payment gateway outside
production builds.

Server and fake logs go to a temp folder; the runner prints its path.
