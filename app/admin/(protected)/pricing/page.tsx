import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { PricingClient } from "./PricingClient";

export const metadata: Metadata = { title: "Pricing — Admin" };

export default async function AdminPricingPage() {
  const tiers = await prisma.pricingTier.findMany({ orderBy: { sortOrder: "asc" } });
  return (
    <div className="max-w-2xl">
      <h1 className="font-heading text-2xl text-brown-dark mb-2">Pricing</h1>
      <p className="text-sm text-brown-light mb-6">
        Changing a price only affects new/unsold bookings — already-sold booths keep the price
        actually charged.
      </p>
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
