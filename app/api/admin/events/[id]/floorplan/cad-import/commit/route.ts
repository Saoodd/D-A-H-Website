import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminGuard";

interface ImportRow {
  code: string;
  gridX: number;
  gridY: number;
  gridW: number;
  gridH: number;
  rotation?: number;
  widthMm?: number | null;
  depthMm?: number | null;
}

// Commits an already-reviewed CAD Import Preview into real Booth records —
// the ONLY step in the CAD import flow that writes to the database. Every
// row becomes a normal Booth row (same fields, same table) exactly as if
// Admin had drawn it by hand — there is no separate "CAD booth" type.
//
// Safe re-import: matches by booth code within the event (the same
// eventId+code uniqueness the rest of the app already relies on). Modes:
//  - "newOnly": creates booths for codes that don't exist yet; codes that
//    already exist are left completely untouched and reported as skipped.
//  - "matchUpdate": creates new codes, and updates geometry/dimensions for
//    existing codes it matches — EXCEPT a booth that is SOLD is never
//    touched by this, at all, regardless of mode. A confirmed booking's
//    booth must never be silently repositioned/resized by a later CAD
//    re-import.
//  - "replace": like matchUpdate, but also deletes any booth in this event
//    that ISN'T present in the new import set — again, never a SOLD booth
//    or one with payment history (same protection as the bulk-delete
//    route), and never one currently held by a vendor mid-booking.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: eventId } = await params;
  const body = await req.json().catch(() => ({}));
  const mode = body.mode === "newOnly" || body.mode === "replace" ? body.mode : "matchUpdate";
  const rows: ImportRow[] = Array.isArray(body.rows) ? body.rows : [];

  if (rows.length === 0) {
    return NextResponse.json({ error: "Nothing to import." }, { status: 400 });
  }
  const codes = rows.map((r) => String(r.code || "").trim());
  if (codes.some((c) => !c)) {
    return NextResponse.json({ error: "Every booth needs a code before importing — correct or remove unlabeled rows in the preview first." }, { status: 400 });
  }
  const dupeWithinRequest = codes.find((c, i) => codes.indexOf(c) !== i);
  if (dupeWithinRequest) {
    return NextResponse.json({ error: `Duplicate code in this import: ${dupeWithinRequest}. Correct labels in the preview first.` }, { status: 400 });
  }

  const existing = await prisma.booth.findMany({ where: { eventId, code: { in: codes } } });
  const existingByCode = new Map(existing.map((b) => [b.code, b]));

  let created = 0;
  let updated = 0;
  const skipped: { code: string; reason: string }[] = [];

  for (const r of rows) {
    const code = r.code.trim();
    const widthMm = r.widthMm == null ? null : Math.round(r.widthMm);
    const depthMm = r.depthMm == null ? null : Math.round(r.depthMm);
    const rotation = ((Math.round(r.rotation ?? 0) % 360) + 360) % 360;
    const match = existingByCode.get(code);

    if (!match) {
      await prisma.booth.create({
        data: { eventId, code, size: "custom", gridX: r.gridX, gridY: r.gridY, gridW: r.gridW, gridH: r.gridH, rotation, widthMm, depthMm, status: "AVAILABLE" },
      });
      created++;
      continue;
    }

    if (mode === "newOnly") {
      skipped.push({ code, reason: "already exists" });
      continue;
    }
    if (match.status === "SOLD") {
      skipped.push({ code, reason: "confirmed booking — geometry left unchanged" });
      continue;
    }
    await prisma.booth.update({
      where: { id: match.id },
      data: { gridX: r.gridX, gridY: r.gridY, gridW: r.gridW, gridH: r.gridH, rotation, widthMm, depthMm },
    });
    updated++;
  }

  let deleted = 0;
  const deleteSkipped: { code: string; reason: string }[] = [];
  if (mode === "replace") {
    const importedCodes = new Set(codes);
    const toConsider = await prisma.booth.findMany({
      where: { eventId, code: { notIn: Array.from(importedCodes) } },
      include: { _count: { select: { payments: true, paymentBooths: true } } },
    });
    const now = new Date();
    const safeToDeleteIds: string[] = [];
    for (const b of toConsider) {
      if (b.status === "SOLD") deleteSkipped.push({ code: b.code, reason: "confirmed booking" });
      else if (b._count.payments > 0 || b._count.paymentBooths > 0) deleteSkipped.push({ code: b.code, reason: "payment history" });
      else if (b.heldByApplicationId != null && b.holdExpiresAt != null && b.holdExpiresAt > now) deleteSkipped.push({ code: b.code, reason: "active vendor hold" });
      else safeToDeleteIds.push(b.id);
    }
    if (safeToDeleteIds.length > 0) {
      const result = await prisma.booth.deleteMany({ where: { id: { in: safeToDeleteIds }, eventId } });
      deleted = result.count;
    }
  }

  return NextResponse.json({
    ok: true,
    created,
    updated,
    skipped: skipped.length,
    skippedDetails: skipped,
    deleted,
    deleteSkipped: deleteSkipped.length,
    deleteSkippedDetails: deleteSkipped,
  });
}
