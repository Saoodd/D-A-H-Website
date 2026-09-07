import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { VendorsClient } from "./VendorsClient";

export const metadata: Metadata = {
  title: "Vendor Info & Application",
  description: "Grow your business at a Dar Al Hay market — requirements, expectations, and how to apply.",
};

export default async function VendorsPage() {
  const events = await prisma.event.findMany({
    where: { status: "PUBLISHED" },
    orderBy: { startDate: "asc" },
  });

  return (
    <VendorsClient
      events={events.map((e) => ({
        id: e.id,
        slug: e.slug,
        name: e.name,
        startDate: e.startDate.toISOString(),
        categories: e.categories,
      }))}
    />
  );
}
