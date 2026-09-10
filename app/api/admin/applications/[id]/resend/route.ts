import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminGuard";
import { sendApplicationApprovedEmail } from "@/lib/email";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const application = await prisma.application.findUnique({ where: { id }, include: { event: true } });
  if (!application) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (application.status !== "ACCEPTED" || !application.acceptanceExpiresAt) {
    return NextResponse.json({ error: "This application is not currently accepted." }, { status: 400 });
  }

  // Deliberately no dedupeKey — this button exists specifically so Admin can
  // resend the exact same acceptance email again on request (PART 33: "one
  // application acceptance = one acceptance email, unless Admin explicitly
  // resends it").
  await sendApplicationApprovedEmail({
    vendorId: application.vendorId,
    vendorEmail: application.email,
    businessName: application.businessName,
    eventId: application.eventId,
    eventName: application.event.name,
    eventStartDate: application.event.startDate,
    eventLocation: application.event.location,
    deadlineHours: application.acceptanceHoursUsed || 24,
    acceptanceExpiresAt: application.acceptanceExpiresAt,
  });

  return NextResponse.json({ ok: true });
}
