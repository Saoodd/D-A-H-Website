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

/** Event-aware price lookup: an EventPricing override for this event+size
 *  wins if present, otherwise falls back to the global PricingTier. Used at
 *  checkout so a specific market can charge a different booth fee without
 *  touching the site-wide defaults. */
export async function getPriceForSizeAtEvent(eventId: string, sizeKey: string): Promise<number | null> {
  const override = await prisma.eventPricing.findUnique({
    where: { eventId_sizeKey: { eventId, sizeKey } },
  });
  if (override) return override.priceAedFils;
  return getPriceForSize(sizeKey);
}

/** Active tiers with this event's price overrides applied, for displaying
 *  the right per-event prices in a floor plan legend or checkout summary. */
export async function getEventPricingTiers(eventId: string) {
  const [tiers, overrides] = await Promise.all([
    getActivePricingTiers(),
    prisma.eventPricing.findMany({ where: { eventId } }),
  ]);
  const overrideMap = new Map(overrides.map((o) => [o.sizeKey, o.priceAedFils]));
  return tiers.map((t) => ({
    ...t,
    priceAedFils: overrideMap.get(t.sizeKey) ?? t.priceAedFils,
    isOverridden: overrideMap.has(t.sizeKey),
  }));
}
