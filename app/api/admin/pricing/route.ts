import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminGuard";

// Updates apply to new/unsold bookings only — sold booths keep the price
// snapshot they were actually charged (Booth.priceAedFilsAtSale).
export async function PATCH(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const tiers = body.tiers as { sizeKey: string; label: string; priceAedFils: number; vatInclusive: boolean; active: boolean }[] | undefined;
  if (!Array.isArray(tiers)) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });

  for (const [i, t] of tiers.entries()) {
    await prisma.pricingTier.upsert({
      where: { sizeKey: t.sizeKey },
      create: {
        sizeKey: t.sizeKey,
        label: t.label,
        priceAedFils: Math.round(t.priceAedFils),
        vatInclusive: !!t.vatInclusive,
        active: t.active !== false,
        sortOrder: i,
      },
      update: {
        label: t.label,
        priceAedFils: Math.round(t.priceAedFils),
        vatInclusive: !!t.vatInclusive,
        active: t.active !== false,
        sortOrder: i,
      },
    });
  }

  return NextResponse.json({ ok: true });
}

export async function POST(req: NextRequest) {
  // Create a brand-new tier (e.g. adding a third size) — same handler shape
  // as PATCH so the admin UI can add a tier without a code change later.
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const sizeKey = String(body.sizeKey || "").trim();
  const label = String(body.label || "").trim();
  const priceAedFils = Math.round(Number(body.priceAedFils));
  if (!sizeKey || !label || Number.isNaN(priceAedFils)) {
    return NextResponse.json({ error: "sizeKey, label and priceAedFils are required." }, { status: 400 });
  }
  const count = await prisma.pricingTier.count();
  const tier = await prisma.pricingTier.create({
    data: { sizeKey, label, priceAedFils, vatInclusive: true, active: true, sortOrder: count },
  });
  return NextResponse.json({ ok: true, tier });
}
