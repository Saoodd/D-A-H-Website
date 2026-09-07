import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { EventForm } from "../EventForm";
import { FloorPlanBuilder } from "./FloorPlanBuilder";
import { EventDangerZone } from "./EventDangerZone";

export const metadata: Metadata = { title: "Edit Event — Admin" };

export default async function EditEventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const event = await prisma.event.findUnique({ where: { id } });
  if (!event) notFound();

  const [existingEvents, tiers] = await Promise.all([
    prisma.event.findMany({ where: { id: { not: id } }, select: { id: true, name: true } }),
    prisma.pricingTier.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
  ]);

  return (
    <div className="max-w-4xl">
      <h1 className="font-heading text-2xl text-brown-dark mb-6">{event.name}</h1>

      <EventForm
        existingEvents={existingEvents}
        initial={{
          id: event.id,
          name: event.name,
          slug: event.slug,
          description: event.description,
          startDate: event.startDate.toISOString(),
          endDate: event.endDate ? event.endDate.toISOString() : null,
          location: event.location,
          coverImage: event.coverImage,
          categoryNeeds: event.categoryNeeds,
          status: event.status,
          whatsappVendorGroupLink: event.whatsappVendorGroupLink,
          acceptanceDeadlineHours: event.acceptanceDeadlineHours,
        }}
      />

      <h2 className="font-heading text-xl text-brown-dark mt-12 mb-4">Floor plan &amp; booths</h2>
      <FloorPlanBuilder
        eventId={event.id}
        tiers={tiers.map((t) => ({ sizeKey: t.sizeKey, label: t.label, priceAedFils: t.priceAedFils }))}
      />

      <EventDangerZone eventId={event.id} eventName={event.name} />
    </div>
  );
}
