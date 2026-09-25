import "server-only";
import { prisma } from "./prisma";
import { formatBoothCodes } from "./constants";

// The single authoritative source for every payment total shown across
// Admin — the Payments overview, a per-event Payments view, and the Event
// workspace's own revenue figure all call into these functions rather than
// each computing their own sum, so they can never disagree (e.g. one
// deriving "revenue" from a booth's sale-price snapshot while another sums
// actual succeeded Payment rows, which can diverge after a manual
// adjustment or a walk-in booth assigned without a payment record).

export interface EventPaymentSummary {
  eventId: string;
  eventName: string;
  eventSlug: string;
  startDate: Date;
  eventStatus: string;
  totalCollectedAedFils: number;
  succeededCount: number;
  pendingCount: number;
  failedCount: number;
}

/** One row per event that has ever had a booking or a listed price — every
 *  event (any status), so a freshly published event with zero payments yet
 *  still shows as its own folder at 0 rather than being invisible. */
export async function getPaymentsOverviewByEvent(): Promise<EventPaymentSummary[]> {
  const [events, grouped] = await Promise.all([
    prisma.event.findMany({ select: { id: true, name: true, slug: true, startDate: true, status: true }, orderBy: { startDate: "desc" } }),
    prisma.payment.groupBy({ by: ["eventId", "status"], _sum: { amountAedFils: true }, _count: { _all: true } }),
  ]);

  const byEvent = new Map<string, { succeeded: number; succeededSum: number; pending: number; failed: number }>();
  for (const row of grouped) {
    const entry = byEvent.get(row.eventId) ?? { succeeded: 0, succeededSum: 0, pending: 0, failed: 0 };
    if (row.status === "SUCCEEDED") {
      entry.succeeded += row._count._all;
      entry.succeededSum += row._sum.amountAedFils ?? 0;
    } else if (row.status === "PENDING") {
      entry.pending += row._count._all;
    } else if (row.status === "FAILED") {
      entry.failed += row._count._all;
    }
    byEvent.set(row.eventId, entry);
  }

  return events.map((e) => {
    const agg = byEvent.get(e.id);
    return {
      eventId: e.id,
      eventName: e.name,
      eventSlug: e.slug,
      startDate: e.startDate,
      eventStatus: e.status,
      totalCollectedAedFils: agg?.succeededSum ?? 0,
      succeededCount: agg?.succeeded ?? 0,
      pendingCount: agg?.pending ?? 0,
      failedCount: agg?.failed ?? 0,
    };
  });
}

/** The one true "revenue" figure for an event — sum of actually succeeded
 *  Payment rows. Used by both the Payments area and the Event workspace's
 *  own Overview tab, so the two can never show contradictory numbers. */
export async function getEventRevenueAedFils(eventId: string): Promise<number> {
  const result = await prisma.payment.aggregate({
    where: { eventId, status: "SUCCEEDED" },
    _sum: { amountAedFils: true },
  });
  return result._sum.amountAedFils ?? 0;
}

export interface EventPaymentsDetail {
  event: { id: string; name: string; slug: string; startDate: Date; location: string };
  summary: {
    totalCollectedAedFils: number;
    totalRefundedAedFils: number;
    succeededCount: number;
    pendingCount: number;
    failedCount: number;
    adjustmentsTotalAedFils: number;
    unresolvedCancellations: number;
  };
  transactions: {
    id: string;
    businessName: string;
    contactName: string;
    email: string;
    phone: string;
    boothCode: string;
    amountAedFils: number;
    status: string;
    refundedAedFils: number;
    needsAttention: string | null;
    provider: string;
    method: string | null;
    providerRef: string | null;
    createdAt: Date;
    paidAt: Date | null;
    applicationId: string;
  }[];
}

/** Everything the per-event Payments workspace needs, scoped ONLY to this
 *  event — so its export can never leak another event's transactions. */
export async function getEventPaymentsDetail(eventId: string): Promise<EventPaymentsDetail | null> {
  const event = await prisma.event.findUnique({ where: { id: eventId }, select: { id: true, name: true, slug: true, startDate: true, location: true } });
  if (!event) return null;

  const [payments, adjustments, unresolvedCancellations] = await Promise.all([
    prisma.payment.findMany({
      where: { eventId },
      include: {
        application: { select: { businessName: true, contactName: true, email: true, phone: true, id: true } },
        booths: { select: { booth: { select: { code: true } } } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.adjustment.aggregate({ where: { application: { eventId } }, _sum: { amountAedFils: true } }),
    prisma.cancellationRequest.count({ where: { status: "PENDING", application: { eventId } } }),
  ]);

  const succeeded = payments.filter((p) => p.status === "SUCCEEDED");
  const pending = payments.filter((p) => p.status === "PENDING");
  const failed = payments.filter((p) => p.status === "FAILED");

  return {
    event,
    summary: {
      totalCollectedAedFils: succeeded.reduce((sum, p) => sum + p.amountAedFils, 0),
      totalRefundedAedFils: succeeded.reduce((sum, p) => sum + p.refundedAedFils, 0),
      succeededCount: succeeded.length,
      pendingCount: pending.length,
      failedCount: failed.length,
      adjustmentsTotalAedFils: adjustments._sum.amountAedFils ?? 0,
      unresolvedCancellations,
    },
    transactions: payments.map((p) => ({
      id: p.id,
      businessName: p.application.businessName,
      contactName: p.application.contactName,
      email: p.application.email,
      phone: p.application.phone,
      boothCode: formatBoothCodes(p.booths.map((pb) => pb.booth.code)),
      amountAedFils: p.amountAedFils,
      status: p.status,
      refundedAedFils: p.refundedAedFils,
      needsAttention: p.needsAttention,
      provider: p.provider,
      method: p.method,
      providerRef: p.providerRef,
      createdAt: p.createdAt,
      paidAt: p.paidAt,
      applicationId: p.application.id,
    })),
  };
}
