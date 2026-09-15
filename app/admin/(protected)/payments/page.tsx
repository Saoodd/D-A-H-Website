import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getPaymentsOverviewByEvent } from "@/lib/payments";
import { formatAed, formatBoothCodes } from "@/lib/constants";
import { PageHeader, EmptyState } from "@/components/ui/Card";
import { LinkButton } from "@/components/ui/Button";
import { AcknowledgeCancelButton } from "./AcknowledgeCancelButton";

export const metadata: Metadata = { title: "Payments — Admin" };

export default async function AdminPaymentsPage() {
  const [events, cancellations] = await Promise.all([
    getPaymentsOverviewByEvent(),
    prisma.cancellationRequest.findMany({
      where: { status: "PENDING" },
      include: { application: { include: { event: true, assignedBooths: true } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const now = new Date();
  const current = events.filter((e) => e.startDate >= now).sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
  const past = events.filter((e) => e.startDate < now).sort((a, b) => b.startDate.getTime() - a.startDate.getTime());

  return (
    <div>
      <PageHeader
        title="Payments"
        description="Organized by event, so transactions from different DAH events are never mixed together — search across everything from All Transactions."
        actions={<LinkButton href="/admin/payments/all" variant="secondary" size="sm">All Transactions</LinkButton>}
      />

      {cancellations.length > 0 && (
        <section className="mb-10">
          <p className="label-caps mb-3">Pending cancellation requests</p>
          <div className="space-y-3">
            {cancellations.map((c) => (
              <div key={c.id} className="flex items-center justify-between rounded-[10px] border border-red-200 bg-red-50 px-4 py-3 flex-wrap gap-2">
                <div className="text-sm">
                  <p className="text-red-900">
                    {c.application.businessName} — {c.application.event.name} — booth{" "}
                    {formatBoothCodes(c.application.assignedBooths.filter((b) => b.status === "SOLD").map((b) => b.code))}
                  </p>
                  <p className="text-xs text-red-700">{c.reason}</p>
                </div>
                <AcknowledgeCancelButton id={c.id} />
              </div>
            ))}
          </div>
        </section>
      )}

      <EventPaymentGroup title="Current / Upcoming" events={current} />
      <EventPaymentGroup title="Past Events" events={past} />
    </div>
  );
}

function EventPaymentGroup({ title, events }: { title: string; events: Awaited<ReturnType<typeof getPaymentsOverviewByEvent>> }) {
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
              href={`/admin/payments/events/${e.eventId}`}
              className="flex items-center justify-between flex-wrap gap-3 rounded-[10px] border border-brown/10 bg-cream hover:border-brown/25 p-5 transition-colors"
            >
              <div>
                <p className="font-heading text-brown-dark">{e.eventName}</p>
                <p className="text-xs text-brown-light mt-0.5">{e.startDate.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}</p>
              </div>
              <div className="text-right">
                <p className="text-brown-dark font-medium">{formatAed(e.totalCollectedAedFils)} collected</p>
                <p className="text-xs text-brown-light mt-0.5">
                  {e.succeededCount} payment{e.succeededCount === 1 ? "" : "s"}
                  {e.pendingCount > 0 && ` · ${e.pendingCount} pending`}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
