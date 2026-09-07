import "server-only";

// -----------------------------------------------------------------------------
// TODO: Replace sandbox provider with live Ziina / Shopify Payments / ADCB
// gateway credentials once DAH has completed KYC and chosen a provider.
// Apple Pay requires HTTPS + domain verification with the chosen provider —
// set up at deployment.
//
// This file is the ONLY place that should know about a specific payment
// provider's SDK/API. Everything else in the app talks to the generic
// `PaymentGateway` interface below, so swapping providers later is a
// one-file change: implement the interface and flip `PAYMENT_PROVIDER`.
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
}

export interface ChargeResult {
  providerRef: string;
  status: ChargeStatus;
}

export interface PaymentGateway {
  readonly name: string;
  /** Start a charge. In a real gateway this creates a payment session/intent. */
  createCharge(params: CreateChargeParams): Promise<ChargeResult>;
  /** Poll/confirm the current status of a previously created charge. */
  confirmPayment(providerRef: string): Promise<ChargeStatus>;
  /** Verify + parse an incoming webhook from the provider. */
  handleWebhook(
    rawBody: string,
    headers: Record<string, string>
  ): Promise<{ providerRef: string; status: ChargeStatus } | null>;
}

// -----------------------------------------------------------------------------
// Sandbox provider — no external calls. Lets the full flow (select booth,
// enter details, "pay", get confirmation) work end-to-end with fake
// transactions, per the build spec's "sandbox mode only" requirement.
// -----------------------------------------------------------------------------
const sandboxCharges = new Map<string, ChargeStatus>();

class SandboxGateway implements PaymentGateway {
  readonly name = "sandbox";

  async createCharge(params: CreateChargeParams): Promise<ChargeResult> {
    const providerRef = `sandbox_${params.applicationId}_${Date.now()}`;
    sandboxCharges.set(providerRef, "PENDING");
    return { providerRef, status: "PENDING" };
  }

  /** Sandbox-only helper: the checkout UI calls this to simulate the vendor
   *  completing (or failing) the Apple Pay / card sheet. Not part of the
   *  generic interface — a real provider would report this via webhook. */
  simulateOutcome(providerRef: string, outcome: "SUCCEEDED" | "FAILED") {
    sandboxCharges.set(providerRef, outcome);
  }

  async confirmPayment(providerRef: string): Promise<ChargeStatus> {
    return sandboxCharges.get(providerRef) ?? "PENDING";
  }

  async handleWebhook(): Promise<{ providerRef: string; status: ChargeStatus } | null> {
    // Sandbox has no real webhook transport; outcomes are set synchronously
    // via simulateOutcome() from the checkout confirm API route instead.
    return null;
  }
}

let cached: PaymentGateway | null = null;

export function getGateway(): PaymentGateway {
  if (cached) return cached;
  const provider = process.env.PAYMENT_PROVIDER || "sandbox";
  switch (provider) {
    // case "ziina": return new ZiinaGateway(...)
    // case "shopify_payments": return new ShopifyPaymentsGateway(...)
    // case "adcb": return new AdcbGateway(...)
    case "sandbox":
    default:
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
