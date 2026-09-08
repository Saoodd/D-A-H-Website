import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatAed } from "@/lib/constants";
import { PageHeader, EmptyState } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { LinkButton } from "@/components/ui/Button";
import { AcknowledgeCancelButton } from "./AcknowledgeCancelButton";

export const metadata: Metadata = { title: "Payments — Admin" };

const statusTone: Record<string, "positive" | "attention" | "negative"> = {
  SUCCEEDED: "positive",
  PENDING: "attention",
  FAILED: "negative",
};

export default async function AdminPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  const { status, q } = await searchParams;
  const search = (q || "").trim();

  const where = {
    ...(status && ["SUCCEEDED", "PENDING", "FAILED"].includes(status) ? { status } : {}),
    ...(search
      ? { application: { businessName: { contains: search, mode: "insensitive" as const } } }
      : {}),
  };

  const [payments, cancellations] = await Promise.all([
    prisma.payment.findMany({
      where,
      include: { application: true, booth: true },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prisma.cancellationRequest.findMany({
      where: { status: "PENDING" },
      include: { application: { include: { event: true, assignedBooths: true } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return (
    <div>
      <PageHeader
        title="Payments"
        description="Bookings are non-refundable once paid unless DAH specifically grants an exception — acknowledging a cancellation request here does not approve a refund."
        actions={
          <LinkButton href="/api/admin/export/bookings" variant="secondary" size="sm">
            Export bookings CSV
          </LinkButton>
        }
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
                    {c.application.assignedBooths.find((b) => b.status === "SOLD")?.code || "?"}
                  </p>
                  <p className="text-xs text-red-700">{c.reason}</p>
                </div>
                <AcknowledgeCancelButton id={c.id} />
              </div>
            ))}
          </div>
        </section>
      )}

      <form className="flex flex-wrap items-center gap-3 mb-6">
        <input
          name="q"
          defaultValue={search}
          placeholder="Search by vendor…"
          className="flex-1 min-w-[220px] border border-brown/20 rounded-lg px-3 py-2 bg-cream text-sm"
        />
        <select name="status" defaultValue={status || ""} className="border border-brown/20 rounded-lg px-3 py-2 bg-cream text-sm">
          <option value="">All statuses</option>
          <option value="SUCCEEDED">Succeeded</option>
          <option value="PENDING">Pending</option>
          <option value="FAILED">Failed</option>
        </select>
        <button type="submit" className="text-sm px-4 py-2 rounded-[6px] border border-brown/30 hover:bg-brown/10">
          Filter
        </button>
        {(status || search) && (
          <Link href="/admin/payments" className="text-xs text-brown-light underline">
            Clear
          </Link>
        )}
      </form>

      {payments.length === 0 ? (
        <EmptyState title="No payments found" description="Try a different search or filter." />
      ) : (
        <div className="overflow-x-auto rounded-[10px] border border-brown/10">
          <table className="min-w-full text-sm bg-cream">
            <thead className="bg-cream-deep/40 text-brown-light text-xs uppercase">
              <tr>
                <th className="text-left px-4 py-3">Vendor</th>
                <th className="text-left px-4 py-3">Booth</th>
                <th className="text-left px-4 py-3">Amount</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-left px-4 py-3">Provider</th>
                <th className="text-left px-4 py-3">Date</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id} className="border-t border-brown/10">
                  <td className="px-4 py-3">{p.application.businessName}</td>
                  <td className="px-4 py-3">{p.booth.code}</td>
                  <td className="px-4 py-3">{formatAed(p.amountAedFils)}</td>
                  <td className="px-4 py-3">
                    <StatusBadge label={p.status} tone={statusTone[p.status] ?? "neutral"} />
                  </td>
                  <td className="px-4 py-3">{p.provider}</td>
                  <td className="px-4 py-3 text-xs">{p.createdAt.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
