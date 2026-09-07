import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { VendorsClient } from "./VendorsClient";

export const metadata: Metadata = {
  title: "Vendor Info & Application",
  description: "Requirements, expectations and how to apply to sell at a Dar Al Hay market.",
};

export default async function VendorsPage() {
  const events = await prisma.event.findMany({
    where: { status: "PUBLISHED" },
    orderBy: { startDate: "asc" },
  });

  return (
    <VendorsClient
      events={events.map((e) => ({ id: e.id, slug: e.slug, name: e.name, startDate: e.startDate.toISOString() }))}
    />
  );
}
