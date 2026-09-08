import "server-only";
import { prisma } from "./prisma";
import { getBoothPrice } from "./pricing";

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

/** The lowest real price across this event's booths — each booth's own
 *  resolved price (direct override, else its size tier), not a blind global
 *  tier lookup. Prefers currently AVAILABLE booths so the figure reflects
 *  what a vendor could actually book right now; falls back to all booths if
 *  every one is currently held/sold so the event still shows a starting
 *  price instead of none. */
export async function getMinPriceForEvent(eventId: string): Promise<number | null> {
  const booths = await prisma.booth.findMany({
    where: { eventId },
    select: { priceAedFils: true, size: true, status: true },
  });
  if (booths.length === 0) return null;
  const available = booths.filter((b) => b.status === "AVAILABLE");
  const pool = available.length > 0 ? available : booths;
  const prices = (await Promise.all(pool.map((b) => getBoothPrice(b, eventId)))).filter(
    (p): p is number => p != null
  );
  if (prices.length === 0) return null;
  return Math.min(...prices);
}
