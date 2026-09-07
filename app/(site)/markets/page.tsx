import type { Metadata } from "next";
import { getPublishedUpcomingEvents, getMinPriceForEvent } from "@/lib/events";
import { MarketsClient } from "./MarketsClient";

export const metadata: Metadata = {
  title: "Upcoming Markets",
  description: "DAH's upcoming community pop-up markets in Dubai — dates, locations and vendor categories.",
};

export default async function MarketsPage() {
  const events = await getPublishedUpcomingEvents();
  const withPricing = await Promise.all(
    events.map(async (e) => ({
      slug: e.slug,
      name: e.name,
      description: e.description,
      location: e.location,
      startDate: e.startDate.toISOString(),
      coverImage: e.coverImage,
      categories: e.categories,
      minPriceAedFils: await getMinPriceForEvent(e.id),
    }))
  );

  return <MarketsClient events={withPricing} />;
}
