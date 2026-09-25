import type { Metadata } from "next";

// Admin area is never indexed (robots.ts also disallows /admin).
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return children;
}
