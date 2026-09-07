import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminGuard";

// Per-event price overrides. Pass priceAedFils: null (or omit the row) to
// clear an override and fall back to the global PricingTier again.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: eventId } = await params;
  const body = await req.json().catch(() => ({}));
  const overrides = body.overrides as { sizeKey: string; priceAedFils: number | null }[] | undefined;
  if (!Array.isArray(overrides)) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });

  for (const o of overrides) {
    if (!o.sizeKey) continue;
    if (o.priceAedFils == null) {
      await prisma.eventPricing.deleteMany({ where: { eventId, sizeKey: o.sizeKey } });
    } else {
      await prisma.eventPricing.upsert({
        where: { eventId_sizeKey: { eventId, sizeKey: o.sizeKey } },
        create: { eventId, sizeKey: o.sizeKey, priceAedFils: Math.round(o.priceAedFils) },
        update: { priceAedFils: Math.round(o.priceAedFils) },
      });
    }
  }

  return NextResponse.json({ ok: true });
}
