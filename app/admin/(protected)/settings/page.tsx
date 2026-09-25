import type { Metadata } from "next";
import { getSettings } from "@/lib/settings";
import { PageHeader } from "@/components/ui/Card";
import { SettingsClient } from "./SettingsClient";
import { getAdminSessionId } from "@/lib/auth";
import { listAdminSessions } from "@/lib/sessionList";
import { ActiveSessionsCard } from "@/components/ActiveSessionsCard";

export const metadata: Metadata = { title: "Settings — Admin" };

export default async function AdminSettingsPage() {
  const [settings, currentSessionId] = await Promise.all([getSettings(), getAdminSessionId()]);
  // The (protected) layout has already required a live admin session.
  const sessions = currentSessionId ? await listAdminSessions(currentSessionId) : [];
  return (
    <div className="max-w-lg">
      <PageHeader title="Settings" />
      <SettingsClient
        mainCommunityWhatsappLink={settings.mainCommunityWhatsappLink}
        defaultAcceptanceDeadlineHours={settings.defaultAcceptanceDeadlineHours}
        contactEmail={settings.contactEmail}
        contactInstagramHandle={settings.contactInstagramHandle}
        tradeLicenseRequired={settings.tradeLicenseRequired}
        allowMultipleBoothsDefault={settings.allowMultipleBoothsDefault}
      />

      <section className="mt-12">
        <p className="label-caps mb-1">Active admin sessions</p>
        <p className="text-sm text-brown-light mb-4">
          Everywhere the admin panel is signed in. After changing the admin password, sign out all other devices.
        </p>
        <ActiveSessionsCard sessions={sessions} apiBase="/api/admin/sessions" signedOutRedirect="/admin/login" />
      </section>
    </div>
  );
}
