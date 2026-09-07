import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatAed } from "@/lib/constants";

export const metadata: Metadata = { title: "Admin Dashboard" };

export default async function AdminDashboardPage() {
  const [totalApplications, pending, accepted, rejected, expired, events, revenueAgg] = await Promise.all([
    prisma.application.count(),
    prisma.application.count({ where: { status: "PENDING" } }),
    prisma.application.count({ where: { status: "ACCEPTED" } }),
    prisma.application.count({ where: { status: "REJECTED" } }),
    prisma.application.count({ where: { status: "ACCEPTANCE_EXPIRED" } }),
    prisma.event.findMany({
      include: { booths: true },
      orderBy: { startDate: "desc" },
      take: 8,
    }),
    prisma.payment.aggregate({ where: { status: "SUCCEEDED" }, _sum: { amountAedFils: true } }),
  ]);

  const totalRevenue = revenueAgg._sum.amountAedFils || 0;

  const cards = [
    { label: "Total applications", value: totalApplications },
    { label: "Pending review", value: pending },
    { label: "Accepted", value: accepted },
    { label: "Rejected", value: rejected },
    { label: "Acceptance expired", value: expired },
    { label: "Revenue collected", value: formatAed(totalRevenue) },
  ];

  return (
    <div>
      <h1 className="font-heading text-2xl text-brown-dark mb-6">Dashboard</h1>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-10">
        {cards.map((c) => (
          <div key={c.label} className="rounded-xl border border-brown/10 bg-cream p-5">
            <p className="text-xs text-brown-light">{c.label}</p>
            <p className="text-2xl font-heading text-brown-dark mt-1">{c.value}</p>
          </div>
        ))}
      </div>

      <h2 className="font-heading text-xl text-brown-dark mb-4">Booths by event</h2>
      <div className="space-y-3">
        {events.map((e) => {
          const sold = e.booths.filter((b) => b.status === "SOLD").length;
          const total = e.booths.length;
          return (
            <Link
              key={e.id}
              href={`/admin/events/${e.id}`}
              className="flex items-center justify-between rounded-lg border border-brown/10 bg-cream-soft px-4 py-3 hover:bg-cream"
            >
              <span className="text-sm text-brown-dark">{e.name}</span>
              <span className="text-xs text-brown-light">
                {sold} / {total} booths sold
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
