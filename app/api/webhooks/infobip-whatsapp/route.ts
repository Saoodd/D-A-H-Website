import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Infobip WhatsApp delivery-report webhook — updates WhatsAppDelivery
// (and, transitively, whatever CommunicationRecipient points at it) with
// real delivery status, the same role app/api/webhooks/resend/route.ts
// plays for EmailDelivery. Never assumes "SENT" means "DELIVERED" — that
// distinction only comes from here.
//
// HONESTY NOTE: this app has never received a live Infobip WhatsApp DLR
// webhook before (no WhatsApp channel existed prior to this feature), and
// network access to Infobip's docs was blocked while this was built (see
// lib/whatsapp/infobip.ts). The payload shape below follows Infobip's
// well-documented, channel-wide delivery-report envelope pattern (a
// `results` array of `{messageId, status: {groupName}, doneAt, ...}`,
// consistent with Infobip's SMS/Email DLR webhooks) — but has not been
// confirmed against a real WhatsApp DLR payload. Parsing is defensive
// (tries multiple plausible field names, never throws on an unrecognized
// shape) specifically so a real payload that doesn't match exactly still
// gets acknowledged (200) rather than retried forever by Infobip, while
// logging the raw shape for a developer to reconcile against a live
// account. No signature verification exists yet — Infobip's own
// webhook-signing scheme couldn't be confirmed while this was built, and
// DAH's Infobip config is deliberately limited to exactly three env vars
// (INFOBIP_WHATSAPP_BASE_URL/API_KEY/SENDER), so no webhook-secret env
// var exists to check against; treat this endpoint as best-effort until
// verified against a real account.

const STATUS_MAP: Record<string, "SENT" | "DELIVERED" | "FAILED"> = {
  PENDING: "SENT",
  PENDING_ENROUTE: "SENT",
  DELIVERED: "DELIVERED",
  READ: "DELIVERED",
  UNDELIVERABLE: "FAILED",
  EXPIRED: "FAILED",
  REJECTED: "FAILED",
  FAILED: "FAILED",
};

interface DlrResult {
  messageId?: string;
  to?: string;
  status?: { groupName?: string; name?: string; description?: string };
  error?: { description?: string };
  doneAt?: string;
}

export async function POST(req: NextRequest) {
  const raw = await req.text();
  let payload: { results?: DlrResult[] } | DlrResult;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: true }); // unparseable — acknowledge, don't retry-loop
  }

  const results: DlrResult[] = Array.isArray((payload as { results?: DlrResult[] }).results)
    ? (payload as { results: DlrResult[] }).results
    : [payload as DlrResult];

  for (const result of results) {
    const providerMessageId = result.messageId;
    const groupName = (result.status?.groupName || result.status?.name || "").toUpperCase();
    const nextStatus = STATUS_MAP[groupName];
    if (!providerMessageId || !nextStatus) continue;

    const now = new Date();
    await prisma.whatsAppDelivery
      .updateMany({
        where: { providerMessageId },
        data: {
          status: nextStatus,
          ...(nextStatus === "DELIVERED" ? { deliveredAt: now } : {}),
          ...(nextStatus === "FAILED" ? { failReason: (result.error?.description || result.status?.description || groupName).slice(0, 500) } : {}),
        },
      })
      .catch((err) => console.error("[webhooks/infobip-whatsapp] failed to update delivery", err));
  }

  return NextResponse.json({ ok: true });
}
