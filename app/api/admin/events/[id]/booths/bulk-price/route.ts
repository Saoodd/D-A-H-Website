import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminGuard";

// Sets the same direct priceAedFils on a batch of booths at once — used by
// the floor plan builder's multi-select mode so admin can reprice a group of
// booths (e.g. after duplicating a floor plan into a new event) without
// editing each one individually.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const boothIds = Array.isArray(body.boothIds) ? body.boothIds.filter((x: unknown) => typeof x === "string") : [];
  const priceAedFils = Math.round(Number(body.priceAedFils));

  if (boothIds.length === 0) {
    return NextResponse.json({ error: "Select at least one booth." }, { status: 400 });
  }
  if (Number.isNaN(priceAedFils) || priceAedFils < 0) {
    return NextResponse.json({ error: "Invalid price." }, { status: 400 });
  }

  const result = await prisma.booth.updateMany({
    where: { id: { in: boothIds }, eventId: id },
    data: { priceAedFils },
  });

  return NextResponse.json({ ok: true, updated: result.count });
}
