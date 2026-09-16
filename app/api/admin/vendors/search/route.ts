import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminGuard";

// Lightweight vendor search for Manual Selection mode / "add an eligible
// vendor manually" in the Communications Compose recipient preview — never
// returns a closed/deleted vendor.
export async function GET(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const query = (searchParams.get("query") || "").trim();
  if (!query) return NextResponse.json({ vendors: [] });

  const vendors = await prisma.vendor.findMany({
    where: {
      accountStatus: "ACTIVE",
      permanentlyDeletedAt: null,
      OR: [{ businessName: { contains: query, mode: "insensitive" } }, { email: { contains: query, mode: "insensitive" } }, { contactName: { contains: query, mode: "insensitive" } }],
    },
    select: { id: true, businessName: true, email: true },
    take: 20,
    orderBy: { businessName: "asc" },
  });

  return NextResponse.json({ vendors });
}
