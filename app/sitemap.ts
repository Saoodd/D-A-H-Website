import type { MetadataRoute } from "next";
import { prisma } from "@/lib/prisma";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

  const staticRoutes = ["", "/markets", "/vendors", "/gallery", "/contact", "/legal/terms", "/legal/privacy", "/legal/refunds"].map(
    (path) => ({
      url: `${siteUrl}${path}`,
      lastModified: new Date(),
    })
  );

  const events = await prisma.event.findMany({
    where: { status: "PUBLISHED" },
    select: { slug: true, updatedAt: true },
  });

  const eventRoutes = events.map((e) => ({
    url: `${siteUrl}/markets/${e.slug}`,
    lastModified: e.updatedAt,
  }));

  return [...staticRoutes, ...eventRoutes];
}
