import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getVendorSession } from "@/lib/auth";
import { LoginClient } from "./LoginClient";

export const metadata: Metadata = { title: "Vendor Login" };

function safeNext(next: string | undefined): string {
  // Only ever redirect within the site — never follow an external "next".
  if (next && next.startsWith("/") && !next.startsWith("//")) return next;
  return "/vendor/dashboard";
}

export default async function VendorLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const target = safeNext(next);
  const session = await getVendorSession();
  if (session) redirect(target);
  return <LoginClient next={target} />;
}
