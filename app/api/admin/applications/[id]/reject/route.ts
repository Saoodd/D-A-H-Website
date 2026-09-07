import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminGuard";
import { sendApplicationRejectedEmail } from "@/lib/email";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const application = await prisma.application.findUnique({ where: { id }, include: { event: true } });
  if (!application) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const updated = await prisma.application.update({
    where: { id },
    data: { status: "REJECTED", rejectedAt: new Date(), acceptanceExpiresAt: null },
  });

  await sendApplicationRejectedEmail({
    vendorEmail: application.email,
    businessName: application.businessName,
    eventName: application.event.name,
  });

  return NextResponse.json({ ok: true, application: updated });
}
