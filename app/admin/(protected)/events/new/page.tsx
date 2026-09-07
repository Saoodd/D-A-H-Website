import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { EventForm } from "../EventForm";

export const metadata: Metadata = { title: "New Event — Admin" };

export default async function NewEventPage() {
  const existingEvents = await prisma.event.findMany({
    select: { id: true, name: true },
    orderBy: { startDate: "desc" },
  });

  return (
    <div className="max-w-2xl">
      <h1 className="font-heading text-2xl text-brown-dark mb-6">New event</h1>
      <EventForm existingEvents={existingEvents} />
    </div>
  );
}
