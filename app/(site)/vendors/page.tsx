import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { VendorsClient } from "./VendorsClient";

export const metadata: Metadata = {
  title: "Vendor Info & Application",
  description: "Booth fees, requirements and how to apply to sell at a Dar Al Hay market.",
};

export default async function VendorsPage() {
  const [events, tiers] = await Promise.all([
    prisma.event.findMany({ where: { status: "PUBLISHED" }, orderBy: { startDate: "asc" } }),
    prisma.pricingTier.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
  ]);

  return (
    <VendorsClient
      events={events.map((e) => ({ id: e.id, slug: e.slug, name: e.name, startDate: e.startDate.toISOString() }))}
      tiers={tiers.map((t) => ({ sizeKey: t.sizeKey, label: t.label, priceAedFils: t.priceAedFils, vatInclusive: t.vatInclusive }))}
    />
  );
}
