import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminGuard";
import { sendAcceptanceExpiredEmail } from "@/lib/email";

// Manual revoke before the deadline — identical effects to automatic expiry.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const application = await prisma.application.findUnique({ where: { id }, include: { event: true } });
  if (!application) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (application.status !== "ACCEPTED") {
    return NextResponse.json({ error: "Only an active acceptance can be revoked." }, { status: 400 });
  }

  const now = new Date();
  await prisma.$transaction([
    prisma.application.update({
      where: { id },
      data: { status: "ACCEPTANCE_EXPIRED", expiredAt: now },
    }),
    prisma.booth.updateMany({
      where: { heldByApplicationId: id, status: "HELD" },
      data: { status: "AVAILABLE", holdStage: null, holdExpiresAt: null, heldByApplicationId: null },
    }),
  ]);

  await sendAcceptanceExpiredEmail({
    vendorId: application.vendorId,
    vendorEmail: application.email,
    businessName: application.businessName,
    eventId: application.eventId,
    eventName: application.event.name,
    dedupeKey: `application_expired:${application.id}:${now.getTime()}`,
  });

  return NextResponse.json({ ok: true });
}
