import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getVendorSession } from "@/lib/auth";

// A vendor's own warnings only — adminNote is never selected, so it can
// never leak through this response regardless of future field additions.
export async function GET() {
  const session = await getVendorSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const warnings = await prisma.vendorWarning.findMany({
    where: { vendorId: session.vendorId },
    select: {
      id: true,
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
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ warnings });
}
