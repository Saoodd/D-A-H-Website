import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { VendorsListClient } from "./VendorsListClient";

export const metadata: Metadata = { title: "Vendors — Admin" };

export default async function AdminVendorsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;

  const vendors = await prisma.vendor.findMany({
    where: status === "verified" ? { verified: true } : status === "unverified" ? { verified: false } : {},
    include: { _count: { select: { applications: true } } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <VendorsListClient
      activeStatus={status || ""}
      vendors={vendors.map((v) => ({
        id: v.id,
        businessName: v.businessName,
        contactName: v.contactName,
        email: v.email,
        phone: v.phone,
        category: v.category,
        description: v.description,
        instagram: v.instagram,
        verified: v.verified,
        applicationCount: v._count.applications,
        createdAt: v.createdAt.toISOString(),
      }))}
    />
  );
}
