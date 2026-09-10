import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";

// Resend signs delivery-status webhooks using Svix's standard scheme
// (svix-id / svix-timestamp / svix-signature headers, HMAC-SHA256 over
// "<id>.<timestamp>.<raw body>", keyed by the base64 payload after the
// "whsec_" prefix in RESEND_WEBHOOK_SECRET). We verify that signature
// ourselves rather than trusting any payload that merely claims to be from
// Resend — an unsigned/unverifiable request is rejected outright.
const TOLERANCE_SECONDS = 5 * 60;

function verifySignature(rawBody: string, svixId: string, svixTimestamp: string, svixSignature: string, secret: string): boolean {
  const secretBytes = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const signedContent = `${svixId}.${svixTimestamp}.${rawBody}`;
  const expected = createHmac("sha256", secretBytes).update(signedContent).digest("base64");

  // svix-signature can carry multiple space-separated "v1,<sig>" values
  // (during secret rotation) — a match on any one is valid.
  return svixSignature
    .split(" ")
    .map((part) => part.split(",")[1])
    .filter(Boolean)
    .some((candidate) => {
      const a = Buffer.from(candidate);
      const b = Buffer.from(expected);
      return a.length === b.length && timingSafeEqual(a, b);
    });
}

// Maps Resend's event types to our own delivery-status vocabulary — only
// ever moves a row forward (never re-marks a DELIVERED row as merely SENT).
const STATUS_BY_EVENT: Record<string, "SENT" | "DELIVERED" | "BOUNCED" | "FAILED"> = {
  "email.sent": "SENT",
  "email.delivered": "DELIVERED",
  "email.bounced": "BOUNCED",
  "email.delivery_delayed": "SENT",
  "email.complained": "BOUNCED",
  "email.failed": "FAILED",
};

export async function POST(req: NextRequest) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    console.warn("[webhooks/resend] RESEND_WEBHOOK_SECRET not set — ignoring webhook delivery.");
    return NextResponse.json({ ok: true });
  }

  const svixId = req.headers.get("svix-id");
  const svixTimestamp = req.headers.get("svix-timestamp");
  const svixSignature = req.headers.get("svix-signature");
  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json({ error: "Missing signature headers" }, { status: 400 });
  }

  const timestampSeconds = Number(svixTimestamp);
  if (!Number.isFinite(timestampSeconds) || Math.abs(Date.now() / 1000 - timestampSeconds) > TOLERANCE_SECONDS) {
    return NextResponse.json({ error: "Signature timestamp out of tolerance" }, { status: 400 });
  }

  const rawBody = await req.text();
  if (!verifySignature(rawBody, svixId, svixTimestamp, svixSignature, secret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const payload = JSON.parse(rawBody) as { type?: string; data?: { email_id?: string } };
  const nextStatus = payload.type ? STATUS_BY_EVENT[payload.type] : undefined;
  const providerMessageId = payload.data?.email_id;
  if (!nextStatus || !providerMessageId) {
    return NextResponse.json({ ok: true }); // Event type we don't track — acknowledged, not an error.
  }

  const now = new Date();
  await prisma.emailDelivery.updateMany({
    where: { providerMessageId },
    data: {
      status: nextStatus,
      ...(nextStatus === "DELIVERED" ? { deliveredAt: now } : {}),
      ...(nextStatus === "FAILED" || nextStatus === "BOUNCED" ? { failReason: payload.type } : {}),
    },
  });

  return NextResponse.json({ ok: true });
}
