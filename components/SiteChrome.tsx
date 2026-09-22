"use client";

import { usePathname } from "next/navigation";
import { SiteHeader } from "./SiteHeader";
import { HomeHeader } from "./HomeHeader";

// Route-based header swap so the homepage can use its own immersive,
// transparent-over-photo nav (HomeHeader) while every other page keeps the
// existing SiteHeader completely unchanged — this is the only thing that
// differs from rendering <SiteHeader /> directly in app/(site)/layout.tsx.
export function SiteChrome({ vendorLoggedIn }: { vendorLoggedIn: boolean }) {
  const pathname = usePathname();
  if (pathname === "/") return <HomeHeader vendorLoggedIn={vendorLoggedIn} />;
  return <SiteHeader vendorLoggedIn={vendorLoggedIn} />;
}
