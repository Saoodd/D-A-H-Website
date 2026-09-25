import type { Metadata } from "next";

// Vendor account area: private or account-management pages, never meant
// for search results (robots.ts also disallows /vendor/).
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function VendorAreaLayout({ children }: { children: React.ReactNode }) {
  return children;
}
