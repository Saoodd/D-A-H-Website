import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/Card";
import { PricingClient } from "./PricingClient";

export const metadata: Metadata = { title: "Pricing — Admin" };

export default async function AdminPricingPage() {
  const tiers = await prisma.pricingTier.findMany({ orderBy: { sortOrder: "asc" } });
  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Global booth pricing"
        description="These size tiers are the default price for every booth. To override a single booth's price for one event, edit it directly in that event's Floor Plan & Booths tab — changes here never touch a booth with its own override."
      />
      <PricingClient
        tiers={tiers.map((t) => ({
          sizeKey: t.sizeKey,
          label: t.label,
          priceAedFils: t.priceAedFils,
          vatInclusive: t.vatInclusive,
          active: t.active,
        }))}
      />
    </div>
  );
}
