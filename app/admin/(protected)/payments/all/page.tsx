import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/Card";
import { TransactionsList } from "@/components/admin/TransactionsList";

export const metadata: Metadata = { title: "All Transactions — Admin" };

export default async function AdminAllTransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; eventId?: string; provider?: string; dateFrom?: string; dateTo?: string }>;
}) {
  const { status, q, eventId, provider, dateFrom, dateTo } = await searchParams;
  const search = (q || "").trim();

  const where: Record<string, unknown> = {
    ...(status && ["SUCCEEDED", "PENDING", "FAILED"].includes(status) ? { status } : {}),
    ...(eventId ? { eventId } : {}),
    ...(provider ? { provider: { equals: provider, mode: "insensitive" as const } } : {}),
    ...(search ? { application: { businessName: { contains: search, mode: "insensitive" as const } } } : {}),
  };
  if (dateFrom || dateTo) {
    where.createdAt = {
      ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
      ...(dateTo ? { lte: new Date(new Date(dateTo).getTime() + 24 * 60 * 60 * 1000) } : {}),
    };
  }

  const [payments, events, providers] = await Promise.all([
    prisma.payment.findMany({
      where,
      include: { application: { include: { event: { select: { name: true } } } }, booth: true },
      orderBy: { createdAt: "desc" },
      take: 300,
    }),
    prisma.event.findMany({ select: { id: true, name: true }, orderBy: { startDate: "desc" } }),
    prisma.payment.findMany({ select: { provider: true }, distinct: ["provider"] }),
  ]);

  const exportQs = new URLSearchParams();
  if (status) exportQs.set("status", status);
  if (search) exportQs.set("q", search);
  if (eventId) exportQs.set("eventId", eventId);
  if (provider) exportQs.set("provider", provider);
  if (dateFrom) exportQs.set("dateFrom", dateFrom);
  if (dateTo) exportQs.set("dateTo", dateTo);

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
          Business
          <input name="q" defaultValue={search} placeholder="Search by vendor…" className="border border-brown/20 rounded-lg px-3 py-2 bg-cream text-sm w-48" />
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
            <option value="SUCCEEDED">Succeeded</option>
            <option value="PENDING">Pending</option>
            <option value="FAILED">Failed</option>
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
        <button type="submit" className="text-sm px-4 py-2 rounded-[6px] border border-brown/30 hover:bg-brown/10">
          Filter
        </button>
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

      <TransactionsList
        showEventColumn
        rows={payments.map((p) => ({
          id: p.id,
          eventName: p.application.event.name,
          businessName: p.application.businessName,
          contactName: p.application.contactName,
          email: p.application.email,
          phone: p.application.phone,
          boothCode: p.booth.code,
          amountAedFils: p.amountAedFils,
          status: p.status,
          provider: p.provider,
          providerRef: p.providerRef,
          createdAt: p.createdAt.toISOString(),
          applicationId: p.application.id,
        }))}
      />
    </div>
  );
}
