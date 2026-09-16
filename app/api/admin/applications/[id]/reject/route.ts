import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminGuard";
import { sendApplicationRejectedEmail } from "@/lib/email";
import { notifyVendorWhatsApp } from "@/lib/notifications/notify";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const application = await prisma.application.findUnique({ where: { id }, include: { event: true } });
  if (!application) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const rejectedAt = new Date();
  const updated = await prisma.application.update({
    where: { id },
    data: { status: "REJECTED", rejectedAt, acceptanceExpiresAt: null },
  });

  await sendApplicationRejectedEmail({
    vendorId: application.vendorId,
    vendorEmail: application.email,
    businessName: application.businessName,
    eventId: application.eventId,
    eventName: application.event.name,
    dedupeKey: `application_rejected:${application.id}:${rejectedAt.getTime()}`,
  });

  await notifyVendorWhatsApp({
    useCase: "APPLICATION_REJECTED",
    vendorId: application.vendorId,
    eventId: application.eventId,
    applicationId: application.id,
    entityId: `${application.id}:${rejectedAt.getTime()}`,
    data: { business_name: application.businessName, event_name: application.event.name },
  });

  return NextResponse.json({ ok: true, application: updated });
}
