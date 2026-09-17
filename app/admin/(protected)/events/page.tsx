import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatAed } from "@/lib/constants";
import { PageHeader, EmptyState } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { LinkButton } from "@/components/ui/Button";

export const metadata: Metadata = { title: "Events — Admin" };

const statusTone: Record<string, "neutral" | "positive" | "attention"> = {
  DRAFT: "neutral",
  PUBLISHED: "positive",
  ARCHIVED: "neutral",
};

export default async function AdminEventsPage() {
  const events = await prisma.event.findMany({
    include: { booths: true, applications: true },
    orderBy: { startDate: "desc" },
  });

  return (
    <div>
      <PageHeader
        title="Events"
        actions={
          <LinkButton href="/admin/events/new" size="sm">
            New event
          </LinkButton>
        }
      />

      {events.length === 0 ? (
        <EmptyState title="No events yet" action={<LinkButton href="/admin/events/new" size="sm">Create your first event</LinkButton>} />
      ) : (
        <div className="space-y-3">
          {events.map((e) => {
            const sold = e.booths.filter((b) => b.status === "SOLD");
            const revenue = sold.reduce((sum, b) => sum + (b.priceAedFilsAtSale || 0), 0);
            const occupancyPct = e.booths.length ? Math.round((sold.length / e.booths.length) * 100) : 0;
            return (
              <Link
                key={e.id}
                href={`/admin/events/${e.id}`}
                className="flex items-center gap-4 rounded-[10px] border border-brown/10 bg-cream hover:border-brown/25 px-5 py-4 flex-wrap transition-colors"
              >
                {e.coverImage ? (
                  <div className="w-16 h-16 rounded-[8px] bg-cream-deep bg-cover bg-center shrink-0" style={{ backgroundImage: `url(${e.coverImage})` }} />
                ) : (
                  <div className="w-16 h-16 rounded-[8px] bg-cream-deep shrink-0" />
                )}
                <div className="flex-1 min-w-[160px]">
                  <p className="font-heading text-brown-dark">{e.name}</p>
                  <p className="text-xs text-brown-light mt-0.5">
                    {e.startDate.toLocaleDateString()} · {e.location}
                  </p>
                </div>
                <div className="flex items-center gap-4 text-xs text-brown-light flex-wrap">
                  <StatusBadge label={e.status} tone={statusTone[e.status] ?? "neutral"} />
                  {!e.venueScaleConfirmed && e.booths.length > 0 && (
                    <StatusBadge label="Scale Needs Configuration" tone="attention" />
                  )}
                  <span>
                    {sold.length}/{e.booths.length} booths ({occupancyPct}%)
                  </span>
                  <span>{e.applications.length} applications</span>
                  <span className="text-brown font-medium">{formatAed(revenue)}</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
