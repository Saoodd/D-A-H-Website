# Payments

How DAH takes and records booth payments, and exactly what has to be built
to switch on a real online payment provider.

> **Status (September 2026)**
> - **No live payment provider is integrated.** DAH hasn't chosen one yet.
>   Candidates discussed: Ziina, Shopify Payments, ADCB. Nothing in the
>   code guesses at any provider's API.
> - **Production takes payments offline.** Online checkout is switched off
>   (`lib/paymentMode.ts`). Vendors see "DAH will contact you to arrange
>   payment", and admins confirm bookings with **Record offline payment**
>   on the application page.
> - **Everything around the provider is built and tested:** lifecycle,
>   webhooks, idempotency, reconciliation, return page, refunds, audit log.
>   A new provider plugs into `payments/gateway.ts`.

## Principles (non-negotiable)

1. **The server decides the amount.** Prices come from `getBoothPrice`; the
   browser never sends a price. Admin-recorded payments must echo the
   server's total back as a confirmation.
2. **The browser never marks anything paid.** A payment becomes paid only
   in these ways:
   - a signature-verified provider webhook;
   - a server-to-server status check (reconciliation or the return page);
   - an admin recording money DAH has actually received.
3. **Every state change is a guarded transition.** Writes are conditional
   updates on the current status, so concurrent writers (webhook plus
   reconciliation, two admins) can't both apply.
4. **Booking and money move together.** Booths SOLD, payment SUCCEEDED,
   deadline cleared and receipt number all happen in one transaction
   (`finalizeBoothSale`).
5. **When in doubt, a person decides.** Paid-after-hold-lapsed,
   paid-after-failed and amount mismatches set `Payment.needsAttention`
   and never auto-sell a booth.

## Lifecycle

Stored in `Payment.status` (see `lib/paymentLifecycle.ts`):

```
CREATED ──► PENDING ──► AUTHORIZED ──► SUCCEEDED (shown as PAID)
   │           │             │
   └──► FAILED / CANCELLED ◄─┘          (FAILED, CANCELLED, SUCCEEDED are final)
```

`SUCCEEDED` is the stored value for "paid". It predates this design, and
bookings, receipts and dashboards query it, so it was deliberately not
renamed; `lifecycleStatus()` presents it as `PAID`.

Refunds don't change `status`. They are money records: `PaymentRefund` rows
plus the running `Payment.refundedAedFils`. The derived lifecycle becomes
`PARTIALLY_REFUNDED` / `REFUNDED`. A refund never cancels the booking or
frees a booth; that stays an explicit admin decision.

The full vocabulary shown in admin and exports: `CREATED`, `PENDING`,
`AUTHORIZED`, `PAID`, `FAILED`, `CANCELLED`, `REFUNDED`,
`PARTIALLY_REFUNDED`.

## Flows

### Online checkout (when a live provider exists)

1. `POST /api/checkout/[applicationId]/start`
   - Re-checks the acceptance, booth hold and Event Terms.
   - Prices the booths server-side.
   - In one transaction, moves the booths REVIEW → PAYMENT (5-minute hold)
     and creates the Payment as `CREATED`.
   - Calls `gateway.createCharge` (outside any transaction) with a
     `returnUrl` to `/vendor/payments/return/<paymentId>`. If the provider
     call fails, the payment becomes `FAILED` and the booths return to
     their review hold.
   - Stores the provider reference: `CREATED → PENDING`.
   - Returns `redirectUrl`; the browser goes to the provider.
2. The provider sends the payer back to `/vendor/payments/return/<id>`.
   That page only **displays** state. It polls
   `GET /api/payments/<id>/status`, which asks the provider server to
   server (`refreshFromProvider`, rate-limited per payment).
3. The provider calls `POST /api/webhooks/payments/<provider>`
   (details below). `applyProviderResult` moves the payment along the
   lifecycle; on PAID it runs `finalizeBoothSale` and sends the receipt
   email and WhatsApp messages.
4. The hourly cron (`/api/cron/notifications`) runs
   `reconcileOpenPayments()`. Open payments older than 2 minutes are
   re-checked with the provider, so a missed webhook can't strand a paid
   booking.

### Webhook handling (`app/api/webhooks/payments/[provider]/route.ts`)

| Step | Guard |
|---|---|
| Route | 404 unless `<provider>` is the configured gateway and it implements `verifyWebhook` |
| Signature | `gateway.verifyWebhook(rawBody, headers)` must verify the provider's signature over the **raw** body, including a timestamp tolerance; any doubt → 400, nothing recorded |
| Idempotency / replay | `PaymentWebhookEvent` unique on `(provider, providerEventId)`; a redelivery answers 200 `duplicate` unless the first attempt errored |
| Lookup | Payment found by `(provider, providerRef)`, never by anything the payer controls; unknown → recorded `NO_PAYMENT`, 200 |
| Amount | Currency and amount must match exactly (fils) → otherwise `AMOUNT_MISMATCH`, flagged, not paid |
| Transition | Guarded update per `lib/paymentLifecycle.ts`; PAID runs `finalizeBoothSale` |
| Errors | 500 so the provider retries; the event row is marked `ERROR`, which lets the retry through |

### Offline payments (current production path)

Admin → application → **Record offline payment**
(`POST /api/admin/applications/[id]/offline-payment`, `lib/offlinePayment.ts`).
- **Recorded:** method (bank transfer / cash / card terminal / other), a
  required reference, and an internal note.
- **Checks:** a server-computed amount the admin confirms; the Event Terms
  gate; the booths must still be held.
- **Effect:** the same `finalizeBoothSale` as online payments. Any open
  online payment for that application is superseded. An `AUTHORIZED` one
  is also flagged, because money may be held at the provider.

### Refunds

Admin → application → payment → **Record a refund**
(`POST /api/admin/payments/[paymentId]/refund`, `lib/refunds.ts`).
- **Through the payment provider:** only offered when the configured
  provider implements `refund()` and the payment was made through it.
- **Already paid back:** bank transfer / cash / other, recorded with a
  reason and reference.
- **Limits:** an atomic cap stops the total refunded exceeding the amount
  paid, even with concurrent requests. Every refund is audited.

### Needs attention

Flagged payments show on the admin application page and in the payment
lists. Resolve the underlying issue (refund, or assign a booth), then use
**Mark resolved** with a note
(`POST /api/admin/payments/[paymentId]/clear-attention`).

### Audit log

`PaymentEvent` is append-only. Event types:

| Type | Recorded when |
|---|---|
| `CREATED` | Payment row created |
| `AUTHORIZED` | Provider authorised the payment |
| `SUCCEEDED` | Payment completed |
| `FAILED` | Payment failed |
| `CANCELLED` | Payer cancelled |
| `OFFLINE_RECORDED` | Admin recorded an offline payment |
| `SUPERSEDED` | An offline payment replaced an open online one |
| `REFUNDED` | Refund recorded |
| `AMOUNT_MISMATCH` | Provider reported a different amount or currency |
| `NEEDS_ATTENTION` | Payment flagged for a person |
| `ATTENTION_CLEARED` | Admin marked the flag resolved |

Each event records the actor (`VENDOR` / `ADMIN` / `SYSTEM` / `GATEWAY`) and
details. Visible per payment under **History** on the admin application
page.

## Payment modes (`lib/paymentMode.ts`)

| Mode | When | Online checkout |
|---|---|---|
| `LIVE` | a real provider is configured | on (redirect + webhook) |
| `SANDBOX` | local development, or production with `ALLOW_SANDBOX_PAYMENTS=true` | fake card buttons; tester picks the outcome |
| `DISABLED` | production with the sandbox provider (today) | off; admins record payments |

## Integrating a real provider — BLOCKED EXTERNAL STEP

Needed from DAH first:
- the provider's API documentation;
- sandbox and live credentials;
- the webhook signing secret;
- confirmation of supported refund and authorise/capture behaviour.

Then:

1. Create `payments/<provider>Gateway.ts` implementing `PaymentGateway`:
   - `createCharge`: create a hosted checkout session for
     `amountAedFils` / `AED`. Pass `returnUrl` / `cancelUrl`, and put the
     DAH payment id in the provider's metadata. Return `providerRef` and
     `redirectUrl`.
   - `verifyWebhook`: verify the signature over the raw body using the
     provider's documented scheme, with a timestamp tolerance. Map the
     provider's event to `{ eventId, providerRef, state, amountAedFils,
     currency }`. Return `null` on any doubt.
   - `getPaymentStatus`: server-to-server status lookup, same mapping.
   - `refund` (if supported).
2. Register it in `getGateway()` (`payments/gateway.ts`, marked
   INTEGRATION POINT). Add its env vars to `lib/env.ts` and `.env.example`.
3. In the provider dashboard, set the webhook URL to
   `https://<domain>/api/webhooks/payments/<provider-name>`.
4. Set `PAYMENT_PROVIDER=<provider-name>` in Vercel. `paymentMode` becomes
   `LIVE` automatically. Remove `ALLOW_SANDBOX_PAYMENTS` if it was set.
5. Test end to end in the provider's test mode before going live: success,
   decline, cancel, webhook redelivery, and a partial refund.
6. Apple Pay (if wanted) needs the provider's domain verification on the
   production domain.

### Testing without a provider

`payments/localTestGateway.ts` is a **development-only** stand-in
(`PAYMENT_PROVIDER=local-test`, `LOCAL_TEST_PAYMENTS_SECRET=<anything>`).
It implements the live hooks with an HMAC-signed webhook so the whole LIVE
path can be exercised locally. It moves no money. It is **refused in
production builds**: `getGateway()` falls back to the sandbox, which
production then disables, and its webhook and dev routes answer 404.
