import "server-only";
import { prisma } from "./prisma";
import { getDisplayStatus } from "./status";
import { DisplayStatus } from "./constants";

export interface EventApplicationSummary {
  eventId: string;
  eventName: string;
  eventSlug: string;
  startDate: Date;
  eventStatus: string;
  total: number;
  counts: Record<DisplayStatus, number>;
}

const emptyCounts = (): Record<DisplayStatus, number> => ({
  PENDING: 0,
  REJECTED: 0,
  ACCEPTED_UNPAID: 0,
  PAID: 0,
  EXPIRED: 0,
});

/** One row per DAH event with authoritative application counts by display
 *  status — computed live from Application + Payment rows, never a stored
 *  counter, so it can never drift from what the per-event list actually
 *  shows. Mirrors getPaymentsOverviewByEvent's event-first shape. */
export async function getApplicationsOverviewByEvent(): Promise<EventApplicationSummary[]> {
  const [events, applications] = await Promise.all([
    prisma.event.findMany({
      select: { id: true, name: true, slug: true, startDate: true, status: true },
      orderBy: { startDate: "desc" },
    }),
    prisma.application.findMany({
      select: {
        eventId: true,
        status: true,
        payments: { where: { status: "SUCCEEDED" }, select: { id: true }, take: 1 },
      },
    }),
  ]);

  const byEvent = new Map<string, Record<DisplayStatus, number>>();
  for (const app of applications) {
    const displayStatus = getDisplayStatus(app, app.payments.length > 0);
    const entry = byEvent.get(app.eventId) ?? emptyCounts();
    entry[displayStatus] += 1;
    byEvent.set(app.eventId, entry);
  }

  return events.map((e) => {
    const counts = byEvent.get(e.id) ?? emptyCounts();
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    return {
      eventId: e.id,
      eventName: e.name,
      eventSlug: e.slug,
      startDate: e.startDate,
      eventStatus: e.status,
      total,
      counts,
    };
  });
}
