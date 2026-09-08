import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getVendorSession } from "@/lib/auth";

// Opening a specific warning marks it viewed (adminNote is still never
// selected — a vendor can never see it, no matter which route is used).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getVendorSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { id } = await params;
  const warning = await prisma.vendorWarning.findUnique({
    where: { id },
    select: {
      id: true,
      vendorId: true,
      title: true,
      description: true,
      severity: true,
      status: true,
      eventId: true,
      event: { select: { name: true, slug: true, startDate: true } },
      viewedAt: true,
      acknowledgedAt: true,
      resolvedAt: true,
      createdAt: true,
    },
  });
  if (!warning || warning.vendorId !== session.vendorId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!warning.viewedAt) {
    await prisma.vendorWarning.update({ where: { id }, data: { viewedAt: new Date() } });
    warning.viewedAt = new Date();
  }

  const { vendorId: _vendorId, ...safe } = warning;
  void _vendorId;
  return NextResponse.json({ warning: safe });
}
