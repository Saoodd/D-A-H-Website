import type { Metadata } from "next";
import { getPublishedUpcomingEvents } from "@/lib/events";
import { prisma } from "@/lib/prisma";
import { HomeClient } from "./HomeClient";
import { getSettings } from "@/lib/settings";
import { jsonLd, organizationJsonLd } from "@/lib/seo";

// No page title: the root layout's default title is the home page title.
export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

export default async function HomePage() {
  const events = await getPublishedUpcomingEvents();
  const nextEvent = events[0] ?? null;

  // Only ever show real DAH photography here — if the admin hasn't
  // uploaded any gallery images yet, this section simply doesn't render.
  const settings = await getSettings();
  const galleryPreview = await prisma.galleryImage.findMany({
    orderBy: { sortOrder: "asc" },
    take: 4,
  });

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(organizationJsonLd({ instagramHandle: settings.contactInstagramHandle })) }} />
      <HomeClient
      nextEvent={
        nextEvent
          ? { name: nextEvent.name, slug: nextEvent.slug, location: nextEvent.location, startDate: nextEvent.startDate.toISOString() }
          : null
      }
      galleryPreview={galleryPreview.map((g) => ({ id: g.id, url: g.url, caption: g.caption }))}
    />
    </>
  );
}
