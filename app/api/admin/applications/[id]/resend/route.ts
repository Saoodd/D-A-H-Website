import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminGuard";
import { sendApplicationApprovedEmail } from "@/lib/email";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const application = await prisma.application.findUnique({ where: { id }, include: { event: true } });
  if (!application) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (application.status !== "ACCEPTED") {
    return NextResponse.json({ error: "This application is not currently accepted." }, { status: 400 });
  }

  await sendApplicationApprovedEmail({
    vendorEmail: application.email,
    businessName: application.businessName,
    eventName: application.event.name,
    deadlineHours: application.acceptanceHoursUsed || 24,
  });

  return NextResponse.json({ ok: true });
}
