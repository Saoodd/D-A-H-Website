import type { Metadata } from "next";
import { getSettings } from "@/lib/settings";
import { SettingsClient } from "./SettingsClient";

export const metadata: Metadata = { title: "Settings — Admin" };

export default async function AdminSettingsPage() {
  const settings = await getSettings();
  return (
    <div className="max-w-lg">
      <h1 className="font-heading text-2xl text-brown-dark mb-6">Settings</h1>
      <SettingsClient
        mainCommunityWhatsappLink={settings.mainCommunityWhatsappLink}
        defaultAcceptanceDeadlineHours={settings.defaultAcceptanceDeadlineHours}
        contactEmail={settings.contactEmail}
        contactInstagramHandle={settings.contactInstagramHandle}
        tradeLicenseRequired={settings.tradeLicenseRequired}
      />
    </div>
  );
}
