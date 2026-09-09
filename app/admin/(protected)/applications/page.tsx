import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { runExpiryPass } from "@/lib/expiry";
import { getDisplayStatus } from "@/lib/status";
import { DISPLAY_STATUS } from "@/lib/constants";
import { getApplicationsOverviewByEvent, type EventApplicationSummary } from "@/lib/applicationsOverview";
import { APPLICATION_DISPLAY_TONE } from "@/lib/applicationDisplay";
import { PageHeader, EmptyState } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ApplicationsListClient } from "./ApplicationsListClient";

export const metadata: Metadata = { title: "Applications — Admin" };

// Compact labels for the event-list summary badges — the fuller labels
// (e.g. "Accepted — Awaiting Action") live in lib/applicationDisplay.ts and
// are used inside each event's own application table.
const compactLabel: Record<string, string> = {
  PENDING: "Pending",
  ACCEPTED_UNPAID: "Accepted",
  PAID: "Confirmed",
  REJECTED: "Rejected",
  EXPIRED: "Expired",
};

export default async function AdminApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;

  await runExpiryPass();

  // A status filter (used by the admin dashboard's "X pending" / "X
  // expiring soon" shortcuts) is a deliberate cross-event search — it stays
  // a flat list. Without one, this is the normal workflow screen, and DAH
  // does not want different events' applicants mixed together there.
  if (status && (DISPLAY_STATUS as readonly string[]).includes(status)) {
    const applications = await prisma.application.findMany({
      include: { event: true, payments: { where: { status: "SUCCEEDED" } } },
      orderBy: { createdAt: "desc" },
    });
    const withDisplay = applications
      .map((a) => ({
        id: a.id,
        businessName: a.businessName,
        email: a.email,
        eventName: a.event.name,
        createdAt: a.createdAt.toISOString(),
        acceptanceExpiresAt: a.acceptanceExpiresAt ? a.acceptanceExpiresAt.toISOString() : null,
        displayStatus: getDisplayStatus(a, a.payments.length > 0),
      }))
      .filter((a) => a.displayStatus === status);

    return <ApplicationsListClient applications={withDisplay} activeStatus={status} />;
  }

  const events = await getApplicationsOverviewByEvent();
  const now = new Date();
  const current = events
    .filter((e) => e.startDate >= now)
    .sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
  const past = events
    .filter((e) => e.startDate < now)
    .sort((a, b) => b.startDate.getTime() - a.startDate.getTime());

  return (
    <div>
      <PageHeader
        title="Applications"
        description="Organized by event, so applicants from different DAH events are never mixed together — search across everything from All Applications."
        actions={
          <Link href="/admin/applications?status=PENDING" className="text-xs text-brown-light hover:text-brown-dark underline underline-offset-2">
            All Applications (cross-event search)
          </Link>
        }
      />

      <EventApplicationGroup title="Current / Upcoming Events" events={current} />
      <EventApplicationGroup title="Past Events" events={past} />
    </div>
  );
}

function EventApplicationGroup({ title, events }: { title: string; events: EventApplicationSummary[] }) {
  return (
    <section className="mb-10">
      <p className="label-caps mb-3">{title}</p>
      {events.length === 0 ? (
        <EmptyState title="No events here yet" />
      ) : (
        <div className="space-y-2">
          {events.map((e) => (
            <Link
              key={e.eventId}
              href={`/admin/applications/events/${e.eventId}`}
              className="flex items-center justify-between flex-wrap gap-4 rounded-[10px] border border-brown/10 bg-cream hover:border-brown/25 p-5 transition-colors"
            >
              <div>
                <p className="font-heading text-brown-dark">{e.eventName}</p>
                <p className="text-xs text-brown-light mt-0.5">
                  {e.startDate.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })} · {e.total}{" "}
                  application{e.total === 1 ? "" : "s"}
                </p>
              </div>
              <div className="flex flex-wrap gap-2 justify-end">
                {DISPLAY_STATUS.filter((s) => e.counts[s] > 0).map((s) => (
                  <StatusBadge key={s} label={`${e.counts[s]} ${compactLabel[s]}`} tone={APPLICATION_DISPLAY_TONE[s]} />
                ))}
                {e.total === 0 && <span className="text-xs text-brown-light">No applications yet</span>}
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
