import "server-only";
import { prisma } from "./prisma";

export async function getPublishedUpcomingEvents() {
  return prisma.event.findMany({
    where: { status: "PUBLISHED", startDate: { gte: new Date(new Date().toDateString()) } },
    orderBy: { startDate: "asc" },
  });
}

export async function getEventBySlugPublic(slug: string) {
  return prisma.event.findFirst({ where: { slug, status: "PUBLISHED" } });
}

export async function getEventBySlugAny(slug: string) {
  return prisma.event.findUnique({ where: { slug } });
}

export async function getMinPriceForEvent(eventId: string): Promise<number | null> {
  const booths = await prisma.booth.findMany({ where: { eventId }, select: { size: true } });
  if (booths.length === 0) return null;
  const sizes = Array.from(new Set(booths.map((b) => b.size)));
  const tiers = await prisma.pricingTier.findMany({ where: { sizeKey: { in: sizes } } });
  if (tiers.length === 0) return null;
  return Math.min(...tiers.map((t) => t.priceAedFils));
}
