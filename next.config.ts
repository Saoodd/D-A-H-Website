import type { NextConfig } from "next";

// Kept deliberately compatible with what the app actually does — the site
// has no external scripts/analytics and self-hosts its Google Fonts (via
// next/font), but does rely on inline `style` attributes (floor plan
// booth positioning/colors) and one inline theme-flash-prevention script,
// so script-src/style-src keep 'unsafe-inline' rather than risk breaking
// those with a nonce-based setup this pass didn't have room to test
// exhaustively. Even so, this still blocks the classic attacks a CSP is
// for: loading a remote script/resource from an attacker-controlled
// domain, framing the site (clickjacking), and submitting a form to a
// foreign origin.
// React's development build uses eval() to reconstruct server error stacks
// in the browser; without 'unsafe-eval' every page logs a CSP error in
// `next dev`. Production React/Next never use eval, so it's dev-only — the
// production policy is unchanged (see Next's own CSP guide, bundled at
// node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md).
const isDev = process.env.NODE_ENV === "development";

const CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  // blob: is only for local, client-side file previews (URL.createObjectURL
  // on a picked-but-not-yet-uploaded image, e.g. Admin Gallery) — never
  // added to script-src/object-src/frame-src, which stay strict.
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Content-Security-Policy", value: CSP },
  // Only meaningful over HTTPS (production) — browsers ignore it on plain
  // HTTP local dev, so it's safe to always send.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  async redirects() {
    return [
      // The public events route used to live at /markets — keep old links
      // (already shared, bookmarked, or indexed) working.
      { source: "/markets", destination: "/events", permanent: true },
      { source: "/markets/:slug", destination: "/events/:slug", permanent: true },
    ];
  },
};

export default nextConfig;
