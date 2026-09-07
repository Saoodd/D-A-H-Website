import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { formatAed } from "@/lib/constants";
import { AcknowledgeCancelButton } from "./AcknowledgeCancelButton";

export const metadata: Metadata = { title: "Payments — Admin" };

export default async function AdminPaymentsPage() {
  const [payments, cancellations] = await Promise.all([
    prisma.payment.findMany({
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
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h1 className="font-heading text-2xl text-brown-dark">Payments</h1>
        <a href="/api/admin/export/bookings" className="text-sm px-4 py-2 rounded-full border border-brown/30 hover:bg-brown/10">
          Export bookings CSV
        </a>
      </div>

      {cancellations.length > 0 && (
        <section className="mb-10">
          <h2 className="font-heading text-lg text-brown-dark mb-3">Pending cancellation requests</h2>
          <div className="space-y-3">
            {cancellations.map((c) => (
              <div key={c.id} className="flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-4 py-3 flex-wrap gap-2">
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

      <div className="overflow-x-auto rounded-xl border border-brown/10">
        <table className="min-w-full text-sm bg-cream-soft">
          <thead className="bg-cream text-brown-light text-xs uppercase">
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
                <td className="px-4 py-3">{p.status}</td>
                <td className="px-4 py-3">{p.provider}</td>
                <td className="px-4 py-3 text-xs">{p.createdAt.toLocaleString()}</td>
              </tr>
            ))}
            {payments.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-brown-light">
                  No payments yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
