import type { Metadata } from "next";
import { getPublishedUpcomingEvents, getMinPriceForEvent } from "@/lib/events";
import { EventsClient } from "./EventsClient";

export const metadata: Metadata = {
  title: "Upcoming Events",
  description: "Dar Al Hay's upcoming events and pop-ups in Dubai — dates, locations and vendor categories.",
};

export default async function EventsPage() {
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
      minPriceAedFils: e.showPublicPricing ? await getMinPriceForEvent(e.id) : null,
    }))
  );

  return <EventsClient events={withPricing} />;
}
