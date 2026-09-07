import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminGuard";
import { getAcceptanceDeadlineHours } from "@/lib/settings";
import { sendApplicationApprovedEmail } from "@/lib/email";

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
    vendorEmail: application.email,
    businessName: application.businessName,
    eventName: application.event.name,
    deadlineHours: hours,
  });

  return NextResponse.json({ ok: true, application: updated });
}
