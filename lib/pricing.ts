import "server-only";
import { prisma } from "./prisma";

export async function getActivePricingTiers() {
  return prisma.pricingTier.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } });
}

export async function getPriceForSize(sizeKey: string): Promise<number | null> {
  const tier = await prisma.pricingTier.findUnique({ where: { sizeKey } });
  if (!tier || !tier.active) return null;
  return tier.priceAedFils;
}
