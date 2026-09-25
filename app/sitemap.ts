import type { MetadataRoute } from "next";
import { prisma } from "@/lib/prisma";
import { siteUrl } from "@/lib/seo";
import { LEGAL_DOC_TYPES, LEGAL_DOCS } from "@/lib/legalDocs";

// Regenerated at most hourly so newly published events appear without a
// redeploy. Search engines are the only consumer, so this cache is never
// authoritative for anything.
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();

  const [events, legal] = await Promise.all([
    prisma.event.findMany({ where: { status: "PUBLISHED" }, select: { slug: true, updatedAt: true } }),
    prisma.agreement.findMany({
      where: { type: { in: [...LEGAL_DOC_TYPES] }, status: "PUBLISHED" },
      select: { type: true, publishedAt: true },
    }),
  ]);
  const legalUpdated = new Map(legal.map((l) => [l.type, l.publishedAt]));

  const pages: MetadataRoute.Sitemap = ["", "/events", "/vendors", "/gallery", "/contact", "/vendor-terms"].map((path) => ({
    url: `${base}${path}`,
  }));
  const legalPages: MetadataRoute.Sitemap = LEGAL_DOC_TYPES.map((t) => ({
    url: `${base}${LEGAL_DOCS[t].path}`,
    ...(legalUpdated.get(t) ? { lastModified: legalUpdated.get(t)! } : {}),
  }));
  const eventPages: MetadataRoute.Sitemap = events.map((e) => ({ url: `${base}/events/${e.slug}`, lastModified: e.updatedAt }));

  return [...pages, ...legalPages, ...eventPages];
}
