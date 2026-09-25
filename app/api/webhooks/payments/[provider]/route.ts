import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getGateway } from "@/payments/gateway";
import { applyProviderResult } from "@/lib/paymentProcessing";

// POST /api/webhooks/payments/<provider>
//
// The only route that can mark an online payment paid from outside DAH.
// 1. Unknown provider, or a provider without verifyWebhook -> 404.
// 2. Signature: gateway.verifyWebhook checks it over the RAW body; any
//    doubt -> 400 and nothing is recorded.
// 3. Idempotency / replay: each provider event id is stored once
//    (unique index). A redelivery answers 200 without re-applying,
//    unless the first attempt errored.
// 4. The payment is found by the provider's reference, never by anything
//    the payer controls; amount and currency must match exactly
//    (lib/paymentProcessing.ts); state changes are guarded transitions.
export async function POST(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const gateway = getGateway();
  if (provider !== gateway.name || !gateway.verifyWebhook) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const rawBody = await req.text();
  const event = await gateway.verifyWebhook(rawBody, req.headers).catch(() => null);
  if (!event) return NextResponse.json({ error: "Invalid signature or payload" }, { status: 400 });

  const existing = await prisma.paymentWebhookEvent.findUnique({
    where: { provider_providerEventId: { provider, providerEventId: event.eventId } },
  });
  if (existing && existing.outcome !== "ERROR") {
    return NextResponse.json({ ok: true, duplicate: true });
  }
  const record =
    existing ??
    (await prisma.paymentWebhookEvent
      .create({ data: { provider, providerEventId: event.eventId, outcome: "PROCESSING", detail: { state: event.state, providerRef: event.providerRef } } })
      .catch(() => null));
  // Lost a race with a concurrent delivery of the same event: that one applies it.
  if (!record) return NextResponse.json({ ok: true, duplicate: true });

  const payment = await prisma.payment.findFirst({ where: { provider, providerRef: event.providerRef } });
  if (!payment) {
    await prisma.paymentWebhookEvent.update({ where: { id: record.id }, data: { outcome: "NO_PAYMENT" } });
    // Acknowledge so the provider stops retrying; the record stays for review.
    return NextResponse.json({ ok: true, ignored: "unknown payment" });
  }

  try {
    const outcome = await applyProviderResult(payment.id, event, "GATEWAY", `webhook:${event.eventId}`);
    await prisma.paymentWebhookEvent.update({
      where: { id: record.id },
      data: { paymentId: payment.id, outcome: outcome === "AMOUNT_MISMATCH" ? "AMOUNT_MISMATCH" : outcome === "IGNORED" ? "IGNORED" : "APPLIED" },
    });
    return NextResponse.json({ ok: true, outcome });
  } catch (err) {
    await prisma.paymentWebhookEvent.update({ where: { id: record.id }, data: { paymentId: payment.id, outcome: "ERROR" } });
    console.error("[payments] webhook processing failed:", err instanceof Error ? err.message : err);
    // 500 so the provider retries; the ERROR outcome allows the retry through.
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
}
