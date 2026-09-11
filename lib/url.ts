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
 *  never at a value an attacker could influence via request headers.
 *
 *  In production, a missing NEXT_PUBLIC_SITE_URL never silently degrades
 *  to a clickable "http://localhost:3000/..." link in a vendor's inbox —
 *  that would look legitimate and could even resolve on a device that
 *  happens to be running something on port 3000. Instead it logs a loud,
 *  actionable server error (visible in Vercel's function logs) and
 *  returns an empty string, so every link built from it becomes a
 *  relative path (e.g. "/vendor/verify") — inert in an email client
 *  rather than a working-looking dead end. The email itself still sends
 *  (per the "a communication failure must never corrupt business state"
 *  rule) — only the link degrades, loudly, until the env var is fixed. */
export function trustedSiteUrl(): string {
  const url = process.env.NEXT_PUBLIC_SITE_URL;
  if (url) return url.replace(/\/+$/, "");

  if (process.env.NODE_ENV === "production") {
    console.error(
      "[config] NEXT_PUBLIC_SITE_URL is not set in production. Every outbound link this app builds (verification emails, password reset, receipts, etc.) will be broken until this is set in Vercel (Production scope) and the app is redeployed. Refusing to fall back to a localhost link."
    );
    return "";
  }

  return "http://localhost:3000";
}
