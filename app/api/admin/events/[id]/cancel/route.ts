import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminGuard";
import { notifyVendorWhatsApp } from "@/lib/notifications/notify";

const CONFIRM_WORD = "CANCEL";

// The ONLY way an event's status can become CANCELLED — deliberately not
// part of the general event PATCH (app/api/admin/events/[id]/route.ts),
// whose own status whitelist doesn't include "CANCELLED" at all, so
// editing a title/date can never accidentally trigger this. Requires the
// literal confirmation word, same UX-gate pattern as vendor permanent
// removal (components/admin/PermanentRemoveVendorModal.tsx) — the real
// guarantee is this server-side check, not the client.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const event = await prisma.event.findUnique({ where: { id } });
  if (!event) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (event.status === "CANCELLED") {
    return NextResponse.json({ error: "This event is already cancelled." }, { status: 409 });
  }

  const body = await req.json().catch(() => ({}));
  if (body.confirmation !== CONFIRM_WORD) {
    return NextResponse.json({ error: `Type "${CONFIRM_WORD}" to confirm.` }, { status: 400 });
  }

  const cancelledAt = new Date();
  await prisma.event.update({ where: { id }, data: { status: "CANCELLED", cancelledAt } });

  // Eligible = still had a live stake in this event at the moment of
  // cancellation — PENDING (awaiting a decision) or ACCEPTED (accepted,
  // whether paid or not). Already-REJECTED or ACCEPTANCE_EXPIRED vendors
  // are excluded — their relationship with this event already concluded
  // for an unrelated reason before the cancellation.
  const affected = await prisma.application.findMany({
    where: { eventId: id, status: { in: ["PENDING", "ACCEPTED"] } },
  });

  let notified = 0;
  for (const application of affected) {
    const result = await notifyVendorWhatsApp({
      useCase: "EVENT_CANCELLED",
      vendorId: application.vendorId,
      eventId: id,
      applicationId: application.id,
      // Per-application, not per-event — several vendors are notified
      // about the SAME event cancellation, and WhatsAppDelivery.dedupeKey
      // is globally unique, so each vendor needs its own dedupeKey.
      entityId: `${id}:${application.id}`,
      data: { business_name: application.businessName, event_name: event.name },
    });
    if (result.ok && !result.skipped) notified++;
  }

  return NextResponse.json({ ok: true, affectedCount: affected.length, notifiedCount: notified });
}
