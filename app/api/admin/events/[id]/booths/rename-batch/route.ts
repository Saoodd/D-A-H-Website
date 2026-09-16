import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminGuard";

interface Rename {
  boothId: string;
  code: string;
}

// Renames a batch of existing booths' codes atomically — used by "Auto
// Number Selected" (e.g. after a CAD import leaves booths unlabeled, or to
// renumber a reordered group). All renames land together or none do.
//
// Two-phase rename inside one transaction: first every targeted booth is
// moved to a private temporary code, then to its real final code. This is
// what makes a reorder like "B1↔B2" (or any cyclic renumbering) safe
// regardless of which row the database happens to process first — a naive
// single-pass rename could transiently collide with the eventId+code
// unique constraint depending on execution order.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: eventId } = await params;
  const body = await req.json().catch(() => ({}));
  const renames: Rename[] = Array.isArray(body.renames)
    ? body.renames.filter((r: unknown) => r && typeof r === "object" && typeof (r as Rename).boothId === "string" && typeof (r as Rename).code === "string")
    : [];

  if (renames.length === 0) {
    return NextResponse.json({ error: "Nothing to rename." }, { status: 400 });
  }

  const codes = renames.map((r) => r.code.trim());
  if (codes.some((c) => !c)) {
    return NextResponse.json({ error: "Every booth needs a code." }, { status: 400 });
  }
  const dupeWithinRequest = codes.find((c, i) => codes.indexOf(c) !== i);
  if (dupeWithinRequest) {
    return NextResponse.json({ error: `Duplicate code in this batch: ${dupeWithinRequest}` }, { status: 400 });
  }

  const boothIds = renames.map((r) => r.boothId);
  const booths = await prisma.booth.findMany({ where: { id: { in: boothIds }, eventId } });
  if (booths.length !== boothIds.length) {
    return NextResponse.json({ error: "Some booths weren't found for this event." }, { status: 404 });
  }

  // A code collides only if it belongs to a booth OUTSIDE this batch —
  // colliding with another booth that's also being renamed in the same
  // batch is fine (that's exactly what the temp-code phase below handles).
  const renamedIds = new Set(boothIds);
  const externalClash = await prisma.booth.findFirst({
    where: { eventId, code: { in: codes }, id: { notIn: Array.from(renamedIds) } },
  });
  if (externalClash) {
    return NextResponse.json(
      { error: `Booth ${externalClash.code} already exists and isn't part of this rename.`, code: "DUPLICATE_CODES", duplicateCodes: [externalClash.code] },
      { status: 409 }
    );
  }

  await prisma.$transaction(async (tx) => {
    for (const r of renames) {
      await tx.booth.update({ where: { id: r.boothId }, data: { code: `__renaming__${r.boothId}` } });
    }
    for (const r of renames) {
      await tx.booth.update({ where: { id: r.boothId }, data: { code: r.code.trim() } });
    }
  });

  return NextResponse.json({ ok: true, renamed: renames.length });
}
