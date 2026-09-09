import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { VendorsListClient } from "./VendorsListClient";

export const metadata: Metadata = { title: "Vendors — Admin" };

const PAGE_SIZE = 25;

type SortKey = "recent" | "name" | "applications";

export default async function AdminVendorsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; sort?: string; page?: string }>;
}) {
  const { status, q, sort, page } = await searchParams;
  const search = (q || "").trim();
  const sortKey: SortKey = sort === "name" || sort === "applications" ? sort : "recent";
  const pageNum = Math.max(1, parseInt(page || "1", 10) || 1);

  const where = {
    ...(status === "verified" ? { verified: true } : status === "unverified" ? { verified: false } : {}),
    ...(search
      ? {
          OR: [
            { businessName: { contains: search, mode: "insensitive" as const } },
            { contactName: { contains: search, mode: "insensitive" as const } },
            { email: { contains: search, mode: "insensitive" as const } },
            { phone: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const orderBy =
    sortKey === "name"
      ? { businessName: "asc" as const }
      : sortKey === "applications"
        ? { applications: { _count: "desc" as const } }
        : { createdAt: "desc" as const };

  const [total, vendors] = await Promise.all([
    prisma.vendor.count({ where }),
    prisma.vendor.findMany({
      where,
      include: { _count: { select: { applications: true } } },
      orderBy,
      skip: (pageNum - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);

  return (
    <VendorsListClient
      activeStatus={status || ""}
      query={search}
      sort={sortKey}
      page={pageNum}
      totalPages={Math.max(1, Math.ceil(total / PAGE_SIZE))}
      total={total}
      vendors={vendors.map((v) => ({
        id: v.id,
        businessName: v.businessName,
        contactName: v.contactName,
        email: v.email,
        phone: v.phone,
        category: v.category,
        instagram: v.instagram,
        logoUrl: v.logoUrl,
        verified: v.verified,
        accountStatus: v.accountStatus,
        applicationCount: v._count.applications,
        createdAt: v.createdAt.toISOString(),
      }))}
    />
  );
}
