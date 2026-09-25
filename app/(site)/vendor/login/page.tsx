import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getVendorSession } from "@/lib/auth";
import { safeInternalPath } from "@/lib/url";
import { googleSignInEnabled } from "@/lib/oauth/google";
import { LoginClient } from "./LoginClient";

export const metadata: Metadata = { title: "Vendor Login" };

export default async function VendorLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; google?: string }>;
}) {
  const { next, google } = await searchParams;
  const target = safeInternalPath(next, "/vendor/dashboard");
  const session = await getVendorSession();
  if (session) redirect(target);
  return <LoginClient next={target} googleEnabled={googleSignInEnabled()} googleStatus={google} />;
}
