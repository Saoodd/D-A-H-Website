import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminGuard";
import { BOOTH_STATUS } from "@/lib/constants";

// General-purpose transactional batch edit for the floor-plan builder's
// multi-select mode — price, physical size (width/depth mm), tier (size
// key), and status, all in one endpoint so bulk mutation logic lives in one
// place rather than a route per field. Reuses the exact same booth model
// and pricing precedence as every single-booth edit (lib/pricing.ts) — this
// is not a competing pricing system, just a batched write to the same
// fields the single-booth PATCH already touches.
//
// Only `status` is ever selectively skipped: a bulk status change must
// never silently release a booth that's SOLD or currently HELD by a vendor
// with an unexpired hold (their in-progress booking). Price/size/tier
// changes apply to every matched booth unconditionally — they never alter
// a booth's booking state, and a sold booth's historical charge is
// preserved separately in Booth.priceAedFilsAtSale (see lib/pricing.ts),
// so re-pricing/resizing/retiering it going forward is harmless.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: eventId } = await params;
  const body = await req.json().catch(() => ({}));
  const boothIds: string[] = Array.isArray(body.boothIds) ? body.boothIds.filter((x: unknown) => typeof x === "string") : [];
  if (boothIds.length === 0) {
    return NextResponse.json({ error: "Select at least one booth." }, { status: 400 });
  }

  const patch = (body.patch && typeof body.patch === "object" ? body.patch : {}) as Record<string, unknown>;
  const data: Record<string, unknown> = {};

  if ("priceAedFils" in patch) {
    const price = patch.priceAedFils == null ? null : Math.round(Number(patch.priceAedFils));
    if (price != null && (Number.isNaN(price) || price < 0)) {
      return NextResponse.json({ error: "Invalid price." }, { status: 400 });
    }
    data.priceAedFils = price;
  }
  if ("widthMm" in patch) {
    const widthMm = patch.widthMm == null ? null : Math.round(Number(patch.widthMm));
    if (widthMm != null && (Number.isNaN(widthMm) || widthMm <= 0)) {
      return NextResponse.json({ error: "Invalid width." }, { status: 400 });
    }
    data.widthMm = widthMm;
  }
  if ("depthMm" in patch) {
    const depthMm = patch.depthMm == null ? null : Math.round(Number(patch.depthMm));
    if (depthMm != null && (Number.isNaN(depthMm) || depthMm <= 0)) {
      return NextResponse.json({ error: "Invalid depth." }, { status: 400 });
    }
    data.depthMm = depthMm;
  }
  if ("size" in patch) {
    const size = String(patch.size || "").trim();
    if (!size) return NextResponse.json({ error: "Invalid tier." }, { status: 400 });
    data.size = size;
    // Assigning a tier is meant to make that tier's price actually take
    // effect — a stale per-booth price override would otherwise silently
    // keep overriding it (see lib/pricing.ts getBoothPrice precedence).
    // Only clear it here if the caller didn't also explicitly set a new
    // price in this same request.
    if (!("priceAedFils" in patch)) data.priceAedFils = null;
  }
  if ("status" in patch) {
    const status = String(patch.status || "");
    if (!(BOOTH_STATUS as readonly string[]).includes(status)) {
      return NextResponse.json({ error: "Invalid status." }, { status: 400 });
    }
    if (status === "SOLD") {
      // Bulk-selling isn't a supported action — a sale always goes through
      // the real checkout flow (or the single-booth inspector's manual
      // assign) so a price snapshot and sold-at timestamp are set correctly.
      return NextResponse.json({ error: "Bulk status change to Sold isn't supported." }, { status: 400 });
    }
    data.status = status;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to change." }, { status: 400 });
  }

  const booths = await prisma.booth.findMany({ where: { id: { in: boothIds }, eventId } });
  if (booths.length === 0) {
    return NextResponse.json({ error: "No matching booths." }, { status: 404 });
  }

  const now = new Date();
  const skipped: { boothId: string; code: string; reason: string }[] = [];
  let targetIds = booths.map((b) => b.id);

  if ("status" in patch) {
    const protectedBooths = booths.filter(
      (b) => b.status === "SOLD" || (b.heldByApplicationId != null && b.holdExpiresAt != null && b.holdExpiresAt > now)
    );
    for (const b of protectedBooths) {
      skipped.push({ boothId: b.id, code: b.code, reason: b.status === "SOLD" ? "confirmed booking" : "active vendor hold" });
    }
    const protectedIds = new Set(protectedBooths.map((b) => b.id));
    targetIds = targetIds.filter((tid) => !protectedIds.has(tid));

    // Status changes never touch a booking's own hold/assignment fields —
    // those are cleared here only for the (already-safe) booths actually
    // being moved, matching the single-booth PATCH route's behavior of
    // resetting hold state on an explicit admin status change.
    data.heldByApplicationId = null;
    data.holdStage = null;
    data.holdExpiresAt = null;
    if (data.status === "AVAILABLE") {
      data.assignedApplicationId = null;
      data.manualAssigneeName = null;
      data.priceAedFilsAtSale = null;
      data.soldAt = null;
    }
  }

  const result = targetIds.length > 0 ? await prisma.booth.updateMany({ where: { id: { in: targetIds }, eventId }, data }) : { count: 0 };

  return NextResponse.json({
    ok: true,
    requested: boothIds.length,
    updated: result.count,
    skipped: skipped.length,
    skippedDetails: skipped,
  });
}
