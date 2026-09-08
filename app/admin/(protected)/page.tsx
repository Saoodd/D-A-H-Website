import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatAed } from "@/lib/constants";
import { MetricCard, PageHeader, EmptyState } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";

export const metadata: Metadata = { title: "Admin Dashboard" };

export default async function AdminDashboardPage() {
  const now = new Date();
  const soon = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const [
    totalApplications,
    pending,
    unverifiedVendors,
    verifiedVendors,
    revenueAgg,
    pendingCancellations,
    nearExpiry,
    nextEvent,
    recentApplications,
    recentVendors,
    recentPayments,
  ] = await Promise.all([
    prisma.application.count(),
    prisma.application.count({ where: { status: "PENDING" } }),
    prisma.vendor.count({ where: { verified: false } }),
    prisma.vendor.count({ where: { verified: true } }),
    prisma.payment.aggregate({ where: { status: "SUCCEEDED" }, _sum: { amountAedFils: true } }),
    prisma.cancellationRequest.count({ where: { status: "PENDING" } }),
    prisma.application.count({
      where: { status: "ACCEPTED", acceptanceExpiresAt: { gte: now, lte: soon } },
    }),
    prisma.event.findFirst({
      where: { status: "PUBLISHED", startDate: { gte: new Date(now.toDateString()) } },
      orderBy: { startDate: "asc" },
      include: {
        booths: true,
        applications: { select: { status: true } },
      },
    }),
    prisma.application.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, businessName: true, createdAt: true, event: { select: { name: true } } },
    }),
    prisma.vendor.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, businessName: true, createdAt: true },
    }),
    prisma.payment.findMany({
      where: { status: "SUCCEEDED" },
      orderBy: { paidAt: "desc" },
      take: 5,
      select: {
        id: true,
        amountAedFils: true,
        paidAt: true,
        application: { select: { businessName: true, id: true, event: { select: { name: true } } } },
      },
    }),
  ]);

  const totalRevenue = revenueAgg._sum.amountAedFils || 0;

  const attentionItems = [
    unverifiedVendors > 0 && {
      label: `${unverifiedVendors} vendor${unverifiedVendors === 1 ? "" : "s"} awaiting verification`,
      href: "/admin/vendors?status=unverified",
    },
    pending > 0 && {
      label: `${pending} application${pending === 1 ? "" : "s"} pending review`,
      href: "/admin/applications?status=PENDING",
    },
    pendingCancellations > 0 && {
      label: `${pendingCancellations} cancellation request${pendingCancellations === 1 ? "" : "s"} to review`,
      href: "/admin/payments",
    },
    nearExpiry > 0 && {
      label: `${nearExpiry} acceptance${nearExpiry === 1 ? "" : "s"} expiring within 24 hours`,
      href: "/admin/applications?status=ACCEPTED",
    },
  ].filter(Boolean) as { label: string; href: string }[];

  const activity = [
    ...recentApplications.map((a) => ({
      at: a.createdAt,
      text: `${a.businessName} applied to ${a.event.name}`,
      href: `/admin/applications/${a.id}`,
    })),
    ...recentVendors.map((v) => ({
      at: v.createdAt,
      text: `${v.businessName} created a DAH business account`,
      href: `/admin/vendors/${v.id}`,
    })),
    ...recentPayments
      .filter((p) => p.paidAt)
      .map((p) => ({
        at: p.paidAt as Date,
        text: `${p.application.businessName} paid ${formatAed(p.amountAedFils)} for ${p.application.event.name}`,
        href: `/admin/applications/${p.application.id}`,
      })),
  ]
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, 8);

  const nextEventStats = nextEvent
    ? {
        daysAway: Math.ceil((nextEvent.startDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)),
        pending: nextEvent.applications.filter((a) => a.status === "PENDING").length,
        accepted: nextEvent.applications.filter((a) => a.status === "ACCEPTED").length,
        rejected: nextEvent.applications.filter((a) => a.status === "REJECTED").length,
        sold: nextEvent.booths.filter((b) => b.status === "SOLD").length,
        totalBooths: nextEvent.booths.length,
        occupancyPct: nextEvent.booths.length
          ? Math.round((nextEvent.booths.filter((b) => b.status === "SOLD").length / nextEvent.booths.length) * 100)
          : 0,
        revenue: nextEvent.booths.reduce((sum, b) => sum + (b.status === "SOLD" ? b.priceAedFilsAtSale || 0 : 0), 0),
      }
    : null;

  return (
    <div>
      <PageHeader title="Overview" description="What DAH looks like right now." />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <MetricCard label="Vendors awaiting verification" value={unverifiedVendors} />
        <MetricCard label="Verified vendors" value={verifiedVendors} />
        <MetricCard label="Total applications" value={totalApplications} />
        <MetricCard label="Revenue collected" value={formatAed(totalRevenue)} />
      </div>

      <div className="grid lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          <section>
            <p className="label-caps mb-3">Next event</p>
            {nextEvent && nextEventStats ? (
              <Link
                href={`/admin/events/${nextEvent.id}`}
                className="block rounded-[10px] border border-brown/10 bg-cream hover:border-brown/25 p-6 transition-colors"
              >
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div>
                    <p className="font-heading text-xl text-brown-dark">{nextEvent.name}</p>
                    <p className="text-xs text-brown-light mt-1">
                      {nextEvent.startDate.toLocaleDateString()} ·{" "}
                      {nextEventStats.daysAway === 0 ? "today" : `in ${nextEventStats.daysAway} day${nextEventStats.daysAway === 1 ? "" : "s"}`}
                    </p>
                  </div>
                  <StatusBadge label={`${nextEventStats.occupancyPct}% occupied`} tone={nextEventStats.occupancyPct >= 80 ? "positive" : "neutral"} />
                </div>
                <div className="grid grid-cols-4 gap-3 mt-5 text-sm">
                  <div>
                    <p className="text-brown-light text-xs">Pending</p>
                    <p className="text-brown-dark font-medium">{nextEventStats.pending}</p>
                  </div>
                  <div>
                    <p className="text-brown-light text-xs">Accepted</p>
                    <p className="text-brown-dark font-medium">{nextEventStats.accepted}</p>
                  </div>
                  <div>
                    <p className="text-brown-light text-xs">Booths sold</p>
                    <p className="text-brown-dark font-medium">
                      {nextEventStats.sold} / {nextEventStats.totalBooths}
                    </p>
                  </div>
                  <div>
                    <p className="text-brown-light text-xs">Revenue</p>
                    <p className="text-brown-dark font-medium">{formatAed(nextEventStats.revenue)}</p>
                  </div>
                </div>
              </Link>
            ) : (
              <EmptyState title="No upcoming published event" description="Publish an event to see it spotlighted here." />
            )}
          </section>

          <section>
            <p className="label-caps mb-3">Recent activity</p>
            {activity.length === 0 ? (
              <EmptyState title="No activity yet" />
            ) : (
              <div className="space-y-2">
                {activity.map((item, i) => (
                  <Link
                    key={i}
                    href={item.href}
                    className="flex items-center justify-between gap-3 rounded-[8px] border border-brown/10 bg-cream hover:border-brown/25 px-4 py-3 transition-colors"
                  >
                    <span className="text-sm text-brown-dark">{item.text}</span>
                    <span className="text-xs text-brown-light whitespace-nowrap">{item.at.toLocaleString()}</span>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </div>

        <div>
          <p className="label-caps mb-3">Requires attention</p>
          {attentionItems.length === 0 ? (
            <EmptyState title="Nothing needs attention" description="You're all caught up." />
          ) : (
            <div className="space-y-2">
              {attentionItems.map((item) => (
                <Link
                  key={item.href + item.label}
                  href={item.href}
                  className="block rounded-[8px] border border-amber-300/60 bg-amber-50 px-4 py-3 text-sm text-amber-900 hover:border-amber-400 transition-colors"
                >
                  {item.label}
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
