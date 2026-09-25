import "server-only";
import { createHmac, timingSafeEqual } from "crypto";
import type { ChargeResult, CreateChargeParams, PaymentGateway, ProviderPaymentResult, ProviderPaymentState, VerifiedWebhookEvent } from "./gateway";

// DEVELOPMENT / TEST ONLY — not a payment provider.
//
// A local stand-in that implements the live-provider hooks
// (getPaymentStatus, verifyWebhook, refund) so the webhook, idempotency,
// reconciliation and refund code can be exercised end to end before DAH
// has a real provider. It moves no money and talks to nothing external.
// getGateway() refuses it in production builds (see gateway.ts).
//
// Its webhook signing mirrors the common real-world pattern so the route
// is tested the way a real provider would use it: header
//   x-local-test-signature: t=<unix seconds>,v1=<hex HMAC-SHA256 of "t.body">
// with LOCAL_TEST_PAYMENTS_SECRET, and a 5-minute timestamp tolerance
// against replays.

const TOLERANCE_SECONDS = 5 * 60;

type ProviderSide = { state: ProviderPaymentState; amountAedFils: number; currency: string };
const store = (globalThis as unknown as { __localTestPayments?: Map<string, ProviderSide> }).__localTestPayments ??
  ((globalThis as unknown as { __localTestPayments?: Map<string, ProviderSide> }).__localTestPayments = new Map());

function secret(): string {
  const s = process.env.LOCAL_TEST_PAYMENTS_SECRET;
  if (!s) throw new Error("LOCAL_TEST_PAYMENTS_SECRET is not set");
  return s;
}

export function signLocalTestWebhook(body: string, timestamp = Math.floor(Date.now() / 1000)): string {
  const v1 = createHmac("sha256", secret()).update(`${timestamp}.${body}`).digest("hex");
  return `t=${timestamp},v1=${v1}`;
}

/** Test hook: set what the "provider" believes about a charge. */
export function setLocalTestProviderState(providerRef: string, state: ProviderSide) {
  store.set(providerRef, state);
}

export class LocalTestGateway implements PaymentGateway {
  readonly name = "local-test";

  async createCharge(params: CreateChargeParams): Promise<ChargeResult> {
    const providerRef = `lt_${params.applicationId}_${Date.now()}`;
    store.set(providerRef, { state: "PENDING", amountAedFils: params.amountAedFils, currency: params.currency });
    // A real provider would return its hosted checkout page. Here the payer
    // goes straight to DAH's return page, which only displays state.
    return { providerRef, status: "PENDING", redirectUrl: params.returnUrl };
  }

  async confirmPayment() {
    return "PENDING" as const;
  }

  async getPaymentStatus(providerRef: string): Promise<ProviderPaymentResult> {
    const s = store.get(providerRef);
    if (!s) throw new Error("unknown charge");
    return { providerRef, ...s };
  }

  async verifyWebhook(rawBody: string, headers: Headers): Promise<VerifiedWebhookEvent | null> {
    const header = headers.get("x-local-test-signature") ?? "";
    const parts = Object.fromEntries(header.split(",").map((kv) => kv.split("=") as [string, string]));
    const t = Number(parts.t);
    if (!t || !parts.v1 || Math.abs(Date.now() / 1000 - t) > TOLERANCE_SECONDS) return null;
    const expected = Buffer.from(createHmac("sha256", secret()).update(`${t}.${rawBody}`).digest("hex"));
    const given = Buffer.from(parts.v1);
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;

    let body: { id?: unknown; providerRef?: unknown; state?: unknown; amountAedFils?: unknown; currency?: unknown };
    try {
      body = JSON.parse(rawBody);
    } catch {
      return null;
    }
    const states = ["PENDING", "AUTHORIZED", "PAID", "FAILED", "CANCELLED"];
    if (typeof body.id !== "string" || typeof body.providerRef !== "string" || !states.includes(String(body.state))) return null;
    if (typeof body.amountAedFils !== "number" || typeof body.currency !== "string") return null;
    return {
      eventId: body.id,
      providerRef: body.providerRef,
      state: body.state as ProviderPaymentState,
      amountAedFils: body.amountAedFils,
      currency: body.currency,
    };
  }

  async refund(providerRef: string, amountAedFils: number): Promise<{ providerRefundId: string }> {
    if (!store.has(providerRef)) throw new Error("unknown charge");
    return { providerRefundId: `lt_refund_${Date.now()}_${amountAedFils}` };
  }
}
