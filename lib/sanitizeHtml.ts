import DOMPurify from "isomorphic-dompurify";

// Every one of these render points holds admin-authored rich text (Terms &
// Conditions, agreement snapshots) via dangerouslySetInnerHTML — this is
// the shared allowlist sanitizer they all run through first. Never trust
// this content just because it came from an authenticated admin session:
// a compromised admin account, or a bug upstream in how the tiptap editor
// serializes/saves content, should never be able to run script in a
// vendor's browser.
const ALLOWED_TAGS = [
  "p", "br", "strong", "em", "u", "s", "a", "ul", "ol", "li",
  "h1", "h2", "h3", "h4", "blockquote", "code", "pre", "hr", "span",
];
const ALLOWED_ATTR = ["href", "target", "rel"];

export function sanitizeAgreementHtml(html: string): string {
  return DOMPurify.sanitize(html, { ALLOWED_TAGS, ALLOWED_ATTR });
}
