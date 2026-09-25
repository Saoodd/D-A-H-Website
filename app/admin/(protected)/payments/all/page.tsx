import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatBoothCodes } from "@/lib/constants";
import { PageHeader } from "@/components/ui/Card";
import { TransactionsList } from "@/components/admin/TransactionsList";
import { Button } from "@/components/ui/Button";
import { PAYMENT_FILTER_STATUSES, parsePaymentFilters, paymentFiltersToQuery, paymentWhere } from "@/lib/paymentFilters";

const PAGE_LIMIT = 300;

export const metadata: Metadata = { title: "All Transactions — Admin" };

export default async function AdminAllTransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; eventId?: string; provider?: string; dateFrom?: string; dateTo?: string }>;
}) {
  const filters = parsePaymentFilters(await searchParams);
  const { status, q: search = "", eventId, provider, dateFrom, dateTo } = filters;
  const where = paymentWhere(filters);

  const [payments, total, events, providers] = await Promise.all([
    prisma.payment.findMany({
      where,
      include: { application: { include: { event: { select: { name: true } } } }, booths: { include: { booth: true } } },
      orderBy: { createdAt: "desc" },
      take: PAGE_LIMIT,
    }),
    prisma.payment.count({ where }),
    prisma.event.findMany({ select: { id: true, name: true }, orderBy: { startDate: "desc" } }),
    prisma.payment.findMany({ select: { provider: true }, distinct: ["provider"] }),
  ]);

  const exportQs = paymentFiltersToQuery(filters);

  return (
    <div>
      <Link href="/admin/payments" className="text-xs text-brown-light hover:text-brown-dark underline underline-offset-2 mb-4 inline-block">
        ← Payments
      </Link>
      <PageHeader
        eyebrow="Payments"
        title="All Transactions"
        description="Search and filter across every DAH event's transactions at once."
      />

      <form className="flex flex-wrap items-end gap-3 mb-6">
        <label className="flex flex-col gap-1 text-xs text-brown-light">
          Search
          <input name="q" defaultValue={search} placeholder="Business, contact, email, receipt…" className="border border-brown/20 rounded-lg px-3 py-2 bg-cream text-sm w-48" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-brown-light">
          Event
          <select name="eventId" defaultValue={eventId || ""} className="border border-brown/20 rounded-lg px-3 py-2 bg-cream text-sm">
            <option value="">All events</option>
            {events.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-brown-light">
          Status
          <select name="status" defaultValue={status || ""} className="border border-brown/20 rounded-lg px-3 py-2 bg-cream text-sm">
            <option value="">All statuses</option>
            {PAYMENT_FILTER_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-brown-light">
          Provider
          <select name="provider" defaultValue={provider || ""} className="border border-brown/20 rounded-lg px-3 py-2 bg-cream text-sm">
            <option value="">All providers</option>
            {providers.map((p) => (
              <option key={p.provider} value={p.provider}>
                {p.provider}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-brown-light">
          From
          <input type="date" name="dateFrom" defaultValue={dateFrom || ""} className="border border-brown/20 rounded-lg px-3 py-2 bg-cream text-sm" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-brown-light">
          To
          <input type="date" name="dateTo" defaultValue={dateTo || ""} className="border border-brown/20 rounded-lg px-3 py-2 bg-cream text-sm" />
        </label>
        <Button type="submit" variant="secondary" size="sm">
          Filter
        </Button>
        {(status || search || eventId || provider || dateFrom || dateTo) && (
          <Link href="/admin/payments/all" className="text-xs text-brown-light underline">
            Clear
          </Link>
        )}
        <a href={`/api/admin/payments/export?${exportQs.toString()}&format=csv`} className="ms-auto px-4 py-2 rounded-full border border-brown/30 text-sm hover:bg-brown/5">
          Export CSV
        </a>
        <a href={`/api/admin/payments/export?${exportQs.toString()}&format=xlsx`} className="px-4 py-2 rounded-full border border-brown/30 text-sm hover:bg-brown/5">
          Export Excel
        </a>
      </form>

      <p className="text-xs text-brown-light mb-3" role="status">
        {total > payments.length
          ? `Showing the ${payments.length} most recent of ${total} matching transactions. Narrow the filters to see older ones; exports include all ${total}.`
          : `${total} matching transaction${total === 1 ? "" : "s"}.`}
      </p>

      <TransactionsList
        showEventColumn
        rows={payments.map((p) => ({
          id: p.id,
          eventName: p.application.event.name,
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
          receiptNumber: p.receiptNumber,
          createdAt: p.createdAt.toISOString(),
          applicationId: p.application.id,
        }))}
      />
    </div>
  );
}
