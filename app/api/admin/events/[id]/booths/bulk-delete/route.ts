import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminGuard";

// Deletes a batch of booths at once from the floor-plan builder's
// multi-select mode, skipping any booth with real booking/payment history
// instead of letting the database's ON DELETE RESTRICT foreign key (see
// Payment.boothId / PaymentBooth.boothId) fail the whole request. A booth
// currently SOLD, or referenced by any Payment/PaymentBooth row (even a
// booth whose status was since manually changed away from SOLD), or
// actively held by a vendor mid-booking, is never deleted here — payment
// and booking history must never be destroyed by a bulk operation.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: eventId } = await params;
  const body = await req.json().catch(() => ({}));
  const boothIds: string[] = Array.isArray(body.boothIds) ? body.boothIds.filter((x: unknown) => typeof x === "string") : [];
  if (boothIds.length === 0) {
    return NextResponse.json({ error: "Select at least one booth." }, { status: 400 });
  }

  const booths = await prisma.booth.findMany({
    where: { id: { in: boothIds }, eventId },
    include: { _count: { select: { payments: true, paymentBooths: true } } },
  });

  const now = new Date();
  const skipped: { boothId: string; code: string; reason: string }[] = [];
  const safeIds: string[] = [];

  for (const b of booths) {
    if (b.status === "SOLD") {
      skipped.push({ boothId: b.id, code: b.code, reason: "confirmed booking" });
    } else if (b._count.payments > 0 || b._count.paymentBooths > 0) {
      skipped.push({ boothId: b.id, code: b.code, reason: "payment history" });
    } else if (b.heldByApplicationId != null && b.holdExpiresAt != null && b.holdExpiresAt > now) {
      skipped.push({ boothId: b.id, code: b.code, reason: "active vendor hold" });
    } else {
      safeIds.push(b.id);
    }
  }

  const result = safeIds.length > 0 ? await prisma.booth.deleteMany({ where: { id: { in: safeIds }, eventId } }) : { count: 0 };

  return NextResponse.json({
    ok: true,
    requested: boothIds.length,
    deleted: result.count,
    skipped: skipped.length,
    skippedDetails: skipped,
  });
}
