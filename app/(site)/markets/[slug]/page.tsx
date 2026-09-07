import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getEventBySlugPublic, getMinPriceForEvent } from "@/lib/events";
import { EventDetailClient } from "./EventDetailClient";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const event = await getEventBySlugPublic(slug);
  if (!event) return {};
  return {
    title: event.name,
    description: event.description || `${event.name} — a Dar Al Hay community market in ${event.location}.`,
    openGraph: {
      title: event.name,
      description: event.description,
      images: event.coverImage ? [{ url: event.coverImage }] : undefined,
    },
  };
}

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const event = await getEventBySlugPublic(slug);
  if (!event) notFound();

  const minPrice = await getMinPriceForEvent(event.id);

  return (
    <EventDetailClient
      event={{
        slug: event.slug,
        name: event.name,
        description: event.description,
        location: event.location,
        startDate: event.startDate.toISOString(),
        endDate: event.endDate ? event.endDate.toISOString() : null,
        coverImage: event.coverImage,
        categoryNeeds: event.categoryNeeds,
        minPriceAedFils: minPrice,
      }}
    />
  );
}
