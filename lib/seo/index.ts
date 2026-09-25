// Search-engine helpers: site URL, indexing policy and JSON-LD.

export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/+$/, "");
}

/** Only the production deployment should be indexed. Vercel Preview /
 *  Development deployments (and local builds) are kept out of search. */
export function isIndexableDeployment(): boolean {
  if (process.env.VERCEL_ENV) return process.env.VERCEL_ENV === "production";
  return process.env.NODE_ENV === "production";
}

export function absoluteUrl(pathOrUrl: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  return `${siteUrl()}${pathOrUrl.startsWith("/") ? "" : "/"}${pathOrUrl}`;
}

/** Serialises structured data for a <script type="application/ld+json">.
 *  `<` is escaped so admin-authored text (event names, descriptions) can
 *  never close the script tag and inject markup. */
export function jsonLd(data: Record<string, unknown>): string {
  return JSON.stringify({ "@context": "https://schema.org", ...data }).replace(/</g, "\\u003c");
}

export function organizationJsonLd(opts: { instagramHandle?: string | null }) {
  const sameAs = opts.instagramHandle ? [`https://www.instagram.com/${opts.instagramHandle.replace(/^@/, "")}`] : undefined;
  return {
    "@type": "Organization",
    name: "Dar Al Hay (DAH)",
    url: siteUrl(),
    logo: absoluteUrl("/icon.png"),
    ...(sameAs ? { sameAs } : {}),
  };
}

export function eventJsonLd(event: {
  slug: string;
  name: string;
  description: string;
  startDate: Date;
  endDate: Date | null;
  location: string;
  coverImage: string | null;
  status: string;
}) {
  return {
    "@type": "Event",
    name: event.name,
    ...(event.description ? { description: event.description } : {}),
    startDate: event.startDate.toISOString(),
    ...(event.endDate ? { endDate: event.endDate.toISOString() } : {}),
    eventStatus: event.status === "CANCELLED" ? "https://schema.org/EventCancelled" : "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    location: {
      "@type": "Place",
      name: event.location,
      address: { "@type": "PostalAddress", streetAddress: event.location, addressCountry: "AE" },
    },
    ...(event.coverImage ? { image: [absoluteUrl(event.coverImage)] } : {}),
    url: absoluteUrl(`/events/${event.slug}`),
    organizer: { "@type": "Organization", name: "Dar Al Hay (DAH)", url: siteUrl() },
  };
}
