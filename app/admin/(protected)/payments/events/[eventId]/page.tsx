import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getEventPaymentsDetail } from "@/lib/payments";
import { formatAed } from "@/lib/constants";
import { PageHeader } from "@/components/ui/Card";
import { LinkButton } from "@/components/ui/Button";
import { EventPaymentsTable } from "./EventPaymentsTable";

export async function generateMetadata({ params }: { params: Promise<{ eventId: string }> }): Promise<Metadata> {
  const { eventId } = await params;
  const detail = await getEventPaymentsDetail(eventId);
  return { title: detail ? `${detail.event.name} Payments — Admin` : "Payments — Admin" };
}

export default async function AdminEventPaymentsPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const detail = await getEventPaymentsDetail(eventId);
  if (!detail) notFound();

  const { event, summary, transactions } = detail;

  return (
    <div>
      <Link href="/admin/payments" className="text-xs text-brown-light hover:text-brown-dark underline underline-offset-2 mb-4 inline-block">
        ← All Events
      </Link>
      <PageHeader
        eyebrow="Payments"
        title={event.name}
        description={`${event.startDate.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}${event.location ? ` · ${event.location}` : ""}`}
        actions={
          <LinkButton href={`/admin/communications/new?eventId=${event.id}&audience=accepted-unpaid`} variant="secondary" size="sm">
            Message Unpaid Vendors
          </LinkButton>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8 text-sm">
        <SummaryTile label="Total collected" value={formatAed(summary.totalCollectedAedFils)} />
        <SummaryTile label="Paid bookings" value={String(summary.succeededCount)} />
        <SummaryTile label="Pending" value={String(summary.pendingCount)} />
        <SummaryTile label="Failed" value={String(summary.failedCount)} />
      </div>
      {(summary.adjustmentsTotalAedFils !== 0 || summary.unresolvedCancellations > 0) && (
        <div className="flex flex-wrap gap-4 text-xs text-brown-light mb-8">
          {summary.adjustmentsTotalAedFils !== 0 && <span>Adjustments: {formatAed(summary.adjustmentsTotalAedFils)}</span>}
          {summary.unresolvedCancellations > 0 && <span>{summary.unresolvedCancellations} unresolved cancellation request(s)</span>}
        </div>
      )}

      <EventPaymentsTable
        eventId={event.id}
        eventName={event.name}
        transactions={transactions.map((t) => ({
          id: t.id,
          businessName: t.businessName,
          contactName: t.contactName,
          email: t.email,
          phone: t.phone,
          boothCode: t.boothCode,
          amountAedFils: t.amountAedFils,
          status: t.status,
          provider: t.provider,
          method: t.method,
          providerRef: t.providerRef,
          createdAt: t.createdAt.toISOString(),
          paidAt: t.paidAt ? t.paidAt.toISOString() : null,
          applicationId: t.applicationId,
        }))}
      />
    </div>
  );
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[10px] border border-brown/10 bg-cream p-4">
      <p className="text-brown-light text-xs">{label}</p>
      <p className="font-heading text-xl text-brown-dark mt-1">{value}</p>
    </div>
  );
}
