import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminGuard";
import { getAcceptanceDeadlineHours } from "@/lib/settings";
import { sendApplicationApprovedEmail } from "@/lib/email";
import { notifyVendorWhatsApp } from "@/lib/notifications/notify";
import { applicationUrl } from "@/lib/notifications/links";

// Approving is also how DAH "re-accepts" a rejected or expired application —
// it always grants a fresh acceptance + deadline regardless of prior status.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const application = await prisma.application.findUnique({ where: { id }, include: { event: true } });
  if (!application) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const override = typeof body.deadlineHoursOverride === "number" ? body.deadlineHoursOverride : null;
  const hours = override && override > 0 ? override : await getAcceptanceDeadlineHours(application.event.acceptanceDeadlineHours);

  const acceptedAt = new Date();
  const acceptanceExpiresAt = new Date(acceptedAt.getTime() + hours * 60 * 60 * 1000);

  const updated = await prisma.application.update({
    where: { id },
    data: {
      status: "ACCEPTED",
      acceptedAt,
      acceptanceExpiresAt,
      acceptanceHoursUsed: hours,
      rejectedAt: null,
      expiredAt: null,
    },
  });

  await sendApplicationApprovedEmail({
    vendorId: application.vendorId,
    vendorEmail: application.email,
    businessName: application.businessName,
    eventId: application.eventId,
    eventName: application.event.name,
    eventStartDate: application.event.startDate,
    eventLocation: application.event.location,
    deadlineHours: hours,
    acceptanceExpiresAt,
    dedupeKey: `application_accepted:${application.id}:${acceptedAt.getTime()}`,
  });

  await notifyVendorWhatsApp({
    useCase: "APPLICATION_ACCEPTED",
    vendorId: application.vendorId,
    eventId: application.eventId,
    applicationId: application.id,
    // Timestamped, like the email dedupeKey above — approve() is also how
    // a rejected/expired application gets re-accepted, and each such
    // acceptance is a fresh, real event worth a fresh notification.
    entityId: `${application.id}:${acceptedAt.getTime()}`,
    data: {
      business_name: application.businessName,
      event_name: application.event.name,
      acceptance_deadline: acceptanceExpiresAt.toLocaleString("en-AE", { dateStyle: "medium", timeStyle: "short" }),
      booking_url: applicationUrl(application.id),
    },
  });

  return NextResponse.json({ ok: true, application: updated });
}
