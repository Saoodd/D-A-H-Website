import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getVendorSession } from "@/lib/auth";
import { LoginClient } from "./LoginClient";

export const metadata: Metadata = { title: "Vendor Login" };

export default async function VendorLoginPage() {
  const session = await getVendorSession();
  if (session) redirect("/vendor/dashboard");
  return <LoginClient />;
}
