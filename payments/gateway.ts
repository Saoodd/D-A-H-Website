import "server-only";

// -----------------------------------------------------------------------------
// Payment provider boundary.
//
// This file is the ONLY place that knows about a specific payment
// provider. Everything else talks to the generic `PaymentGateway`
// interface below, so adding a real provider means implementing it here
// and setting PAYMENT_PROVIDER. See docs/PAYMENTS.md for the full
// integration checklist.
//
// No live provider is implemented. DAH has not chosen one (candidates so
// far: Ziina, Shopify Payments, ADCB), and nothing here guesses at any
// provider's API. Every place a live provider plugs in is marked
// "INTEGRATION POINT".
//
// Trust rules every implementation must follow:
// - The browser is never the source of truth. A payment becomes paid only
//   from verifyWebhook (signature-checked) or getPaymentStatus (a
//   server-to-server call), never from a return-URL query string.
// - verifyWebhook must check the provider's signature over the RAW request
//   body before trusting any field, and return null on any doubt.
// - Amounts are integer fils (1 AED = 100 fils), always compared exactly.
// -----------------------------------------------------------------------------

export type ChargeStatus = "PENDING" | "SUCCEEDED" | "FAILED";

export interface CreateChargeParams {
  amountAedFils: number;
  currency: string;
  applicationId: string;
  boothId: string;
  eventId: string;
  vendorEmail: string;
  description: string;
  /** Where the provider should send the payer afterwards. The return page
   *  only DISPLAYS state; it never marks anything paid. */
  returnUrl?: string;
  cancelUrl?: string;
}

export interface ChargeResult {
  providerRef: string;
  status: ChargeStatus;
  /** Hosted payment page to send the payer to, for redirect-style providers. */
  redirectUrl?: string;
}

/** What a provider says about a payment, normalised. */
export type ProviderPaymentState = "PENDING" | "AUTHORIZED" | "PAID" | "FAILED" | "CANCELLED";

export interface ProviderPaymentResult {
  providerRef: string;
  state: ProviderPaymentState;
  /** Amount the provider actually processed, integer fils. */
  amountAedFils: number;
  currency: string;
}

export interface VerifiedWebhookEvent extends ProviderPaymentResult {
  /** The provider's unique id for this delivery/event (idempotency key). */
  eventId: string;
}

export interface PaymentGateway {
  readonly name: string;
  /** Opens a charge / hosted checkout session with the provider. */
  createCharge(params: CreateChargeParams): Promise<ChargeResult>;
  /** Legacy status poll, used by the sandbox. */
  confirmPayment(providerRef: string): Promise<ChargeStatus>;

  /** INTEGRATION POINT — server-to-server status lookup, used by
   *  reconciliation (lib/paymentProcessing.ts) and the return page. */
  getPaymentStatus?(providerRef: string): Promise<ProviderPaymentResult>;

  /** INTEGRATION POINT — verify the provider's signature over the raw body
   *  and parse the event. Return null if the signature (or anything else)
   *  doesn't check out; the webhook route then answers 400. */
  verifyWebhook?(rawBody: string, headers: Headers): Promise<VerifiedWebhookEvent | null>;

  /** INTEGRATION POINT — refund through the provider. When absent, admins
   *  can only record refunds DAH paid back by hand. */
  refund?(providerRef: string, amountAedFils: number, reason: string): Promise<{ providerRefundId: string }>;
}

// -----------------------------------------------------------------------------
// Sandbox provider — no external calls. Only for local development and
// deployments that set ALLOW_SANDBOX_PAYMENTS=true; production refuses it
// otherwise (lib/paymentMode.ts). Deliberately implements none of the
// live-provider hooks above.
// -----------------------------------------------------------------------------
const sandboxCharges = new Map<string, ChargeStatus>();

class SandboxGateway implements PaymentGateway {
  readonly name = "sandbox";

  async createCharge(params: CreateChargeParams): Promise<ChargeResult> {
    const providerRef = `sandbox_${params.applicationId}_${Date.now()}`;
    sandboxCharges.set(providerRef, "PENDING");
    return { providerRef, status: "PENDING" };
  }

  /** Sandbox-only helper: the checkout confirm route records the outcome
   *  the tester picked. Not part of the generic interface. */
  simulateOutcome(providerRef: string, outcome: "SUCCEEDED" | "FAILED") {
    sandboxCharges.set(providerRef, outcome);
  }

  async confirmPayment(providerRef: string): Promise<ChargeStatus> {
    return sandboxCharges.get(providerRef) ?? "PENDING";
  }
}

let cached: PaymentGateway | null = null;

export function getGateway(): PaymentGateway {
  if (cached) return cached;
  const provider = process.env.PAYMENT_PROVIDER || "sandbox";
  switch (provider) {
    // INTEGRATION POINT — register the real provider here, e.g.
    //   case "adcb": cached = new AdcbGateway(...); return cached;
    // only once its API docs and credentials are in hand.
    case "sandbox":
      cached = new SandboxGateway();
      return cached;
    case "local-test":
      // Development/test stand-in (payments/localTestGateway.ts). Never in
      // production builds: fall through to the refusal below.
      if (process.env.NODE_ENV !== "production") {
        // eslint-disable-next-line @typescript-eslint/no-require-imports -- loaded only outside production
        const { LocalTestGateway } = require("./localTestGateway") as typeof import("./localTestGateway");
        cached = new LocalTestGateway();
        return cached;
      }
      console.error('[payments] PAYMENT_PROVIDER="local-test" is a development stand-in and is refused in production. Using the sandbox.');
      cached = new SandboxGateway();
      return cached;
    default:
      // An unknown PAYMENT_PROVIDER must not silently fall back to the
      // sandbox in production: log loudly and use the sandbox, which
      // lib/paymentMode.ts then refuses in production builds.
      console.error(`[payments] Unknown PAYMENT_PROVIDER "${provider}" — no such gateway is implemented. Using the sandbox.`);
      cached = new SandboxGateway();
      return cached;
  }
}

export function getSandboxGateway(): SandboxGateway {
  const gw = getGateway();
  if (gw.name !== "sandbox") {
    throw new Error("Sandbox helper called while a non-sandbox gateway is configured");
  }
  return gw as SandboxGateway;
}
