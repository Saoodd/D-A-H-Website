import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getVendorSession } from "@/lib/auth";

// Acknowledging only confirms the vendor has seen the notice — it is not
// agreement, and never changes the warning's status (admin controls that).
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getVendorSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { id } = await params;
  const warning = await prisma.vendorWarning.findUnique({ where: { id } });
  if (!warning || warning.vendorId !== session.vendorId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const now = new Date();
  await prisma.vendorWarning.update({
    where: { id },
    data: { acknowledgedAt: warning.acknowledgedAt ?? now, viewedAt: warning.viewedAt ?? now },
  });

  return NextResponse.json({ ok: true });
}
