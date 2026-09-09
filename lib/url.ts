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
