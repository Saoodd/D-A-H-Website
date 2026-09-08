import type { Metadata } from "next";
import { getSettings } from "@/lib/settings";
import { VendorsClient } from "./VendorsClient";

export const metadata: Metadata = {
  title: "Become a DAH Vendor",
  description: "Create your DAH business account, then apply to individual Dar Al Hay events once you're verified.",
};

export default async function VendorsPage() {
  const settings = await getSettings();
  return <VendorsClient tradeLicenseRequired={settings.tradeLicenseRequired} />;
}
