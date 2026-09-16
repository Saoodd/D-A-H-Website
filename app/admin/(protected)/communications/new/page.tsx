import { prisma } from "@/lib/prisma";
import { VENDOR_CATEGORIES } from "@/lib/constants";
import { ComposeClient } from "./ComposeClient";

// Quick-action deep links land here with query params, e.g.
// /admin/communications/new?eventId=...&audience=paid&audience=unpaid or
// ?eventId=...&audience=accepted — see ComposeClient for how these map to
// AudienceFilters.displayStatuses.
export default async function ComposeCommunicationPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const [events, tiers] = await Promise.all([
    prisma.event.findMany({ select: { id: true, name: true, status: true }, orderBy: { startDate: "desc" } }),
    prisma.pricingTier.findMany({ where: { active: true }, select: { sizeKey: true, label: true }, orderBy: { sortOrder: "asc" } }),
  ]);

  return (
    <ComposeClient
      events={events}
      tiers={tiers}
      vendorCategories={[...VENDOR_CATEGORIES]}
      initialEventId={typeof params.eventId === "string" ? params.eventId : null}
      initialAudience={typeof params.audience === "string" ? [params.audience] : Array.isArray(params.audience) ? params.audience : []}
    />
  );
}
