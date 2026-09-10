/** True only for a syntactically valid, non-empty http(s) URL. Used to
 *  decide whether an admin-entered link (e.g. the WhatsApp community
 *  link) is safe to render as a live CTA, rather than trusting any
 *  non-empty string. */
export function isValidHttpUrl(value: string | null | undefined): value is string {
  if (!value) return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  try {
    const url = new URL(trimmed);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/** The one, server-side-trusted base URL used to build every link that
 *  leaves the app (emails, SMS, webhooks) — reads NEXT_PUBLIC_SITE_URL
 *  (set to the real production domain in Vercel), never a client-supplied
 *  host/origin header, so a transactional email can never accidentally
 *  point at localhost, a preview deployment, or a stale branch URL, and
 *  never at a value an attacker could influence via request headers. */
export function trustedSiteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/+$/, "");
}
