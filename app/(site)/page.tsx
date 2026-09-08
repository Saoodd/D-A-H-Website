import type { Metadata } from "next";
import { getPublishedUpcomingEvents } from "@/lib/events";
import { prisma } from "@/lib/prisma";
import { HomeClient } from "./HomeClient";

export const metadata: Metadata = {
  title: "Home",
};

export default async function HomePage() {
  const events = await getPublishedUpcomingEvents();
  const nextEvent = events[0] ?? null;

  // Only ever show real DAH photography here — if the admin hasn't
  // uploaded any gallery images yet, this section simply doesn't render.
  const galleryPreview = await prisma.galleryImage.findMany({
    orderBy: { sortOrder: "asc" },
    take: 4,
  });

  return (
    <HomeClient
      nextEvent={
        nextEvent
          ? { name: nextEvent.name, slug: nextEvent.slug, location: nextEvent.location, startDate: nextEvent.startDate.toISOString() }
          : null
      }
      galleryPreview={galleryPreview.map((g) => ({ id: g.id, url: g.url, caption: g.caption }))}
    />
  );
}
