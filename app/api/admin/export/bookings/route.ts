import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminGuard";
import { toCsv } from "@/lib/csv";
import { filsToAed } from "@/lib/constants";

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const booths = await prisma.booth.findMany({
    where: { status: { in: ["SOLD", "RESERVED"] } },
    include: { event: true, assignedApplication: true },
    orderBy: { soldAt: "desc" },
  });

  const csv = toCsv(
    booths.map((b) => ({
      boothCode: b.code,
      event: b.event.name,
      size: b.size,
      status: b.status,
      vendor: b.assignedApplication?.businessName || b.manualAssigneeName || "",
      email: b.assignedApplication?.email || "",
      priceAed: b.priceAedFilsAtSale != null ? filsToAed(b.priceAedFilsAtSale) : "",
      soldAt: b.soldAt ? b.soldAt.toISOString() : "",
    }))
  );

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="dah-bookings-${Date.now()}.csv"`,
    },
  });
}
