import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/Card";
import { getEventTermsOverview } from "@/lib/agreements";
import { EventTermsListClient } from "./EventTermsListClient";

export const metadata: Metadata = { title: "Event Terms — Admin" };

export default async function AdminEventTermsPage() {
  const events = await getEventTermsOverview();

  return (
    <div className="max-w-5xl">
      <PageHeader
        eyebrow="Agreements → Event Terms"
        title="Event Terms"
        description="Each DAH event carries its own, separate Terms & Conditions — written, published and signed independently of Signup Terms and of every other event."
      />
      <EventTermsListClient
        events={events.map((e) => ({
          eventId: e.eventId,
          eventName: e.eventName,
          startDate: e.startDate.toISOString(),
          location: e.location,
          eventStatus: e.eventStatus,
          publishedVersion: e.publishedVersion,
          hasDraft: e.hasDraft,
          relevantCount: e.relevantCount,
          signedCount: e.signedCount,
        }))}
      />
    </div>
  );
}
