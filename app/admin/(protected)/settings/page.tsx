import type { Metadata } from "next";
import { getSettings } from "@/lib/settings";
import { PageHeader } from "@/components/ui/Card";
import { SettingsClient } from "./SettingsClient";

export const metadata: Metadata = { title: "Settings — Admin" };

export default async function AdminSettingsPage() {
  const settings = await getSettings();
  return (
    <div className="max-w-lg">
      <PageHeader title="Settings" />
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
