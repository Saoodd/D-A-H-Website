import type { Metadata } from "next";
import { getPublishedUpcomingEvents } from "@/lib/events";
import { HomeClient } from "./HomeClient";

export const metadata: Metadata = {
  title: "Home",
};

export default async function HomePage() {
  const events = await getPublishedUpcomingEvents();
  const nextEvent = events[0] ?? null;
  return <HomeClient nextEvent={nextEvent ? { name: nextEvent.name, slug: nextEvent.slug, location: nextEvent.location, startDate: nextEvent.startDate.toISOString() } : null} />;
}
