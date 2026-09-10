"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale } from "@/lib/i18n/context";
import { Countdown } from "@/components/Countdown";
import { UpcomingEventsSection, type UpcomingEventRow } from "./UpcomingEventsSection";
import { ConfirmedEventsSection, type ConfirmedEventRow } from "./ConfirmedEventsSection";
import { ApplicationsOverviewSection, type OverviewAppRow } from "./ApplicationsOverviewSection";
import { VendorNav } from "@/components/vendor/VendorNav";
import { Button } from "@/components/ui/Button";

/** The vendor dashboard's Overview — the main control center, per the
 *  navigation restructure: no more top tab row (Overview/Applications/
 *  Events/Payments). Applications and Events now live directly inside this
 *  page; Payments moved to its own route, reachable from the left sidebar. */
export function DashboardClient({
  businessName,
  communityLink,
  confirmedEvents,
  upcomingEvents,
  recentApplications,
  totalApplicationsCount,
  unviewedWarnings,
}: {
  businessName: string;
  communityLink: string | null;
  confirmedEvents: ConfirmedEventRow[];
  upcomingEvents: UpcomingEventRow[];
  recentApplications: OverviewAppRow[];
  totalApplicationsCount: number;
  unviewedWarnings: { id: string; title: string }[];
}) {
  const { t } = useLocale();
  const router = useRouter();
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const nearDeadline = recentApplications.filter((a) => a.displayStatus === "ACCEPTED_UNPAID" && a.acceptanceExpiresAt);
  const hasActionItems = unviewedWarnings.length > 0 || nearDeadline.length > 0;

  async function applyToEvent(eventId: string) {
    setApplyingId(eventId);
    setNotice(null);
    try {
      const res = await fetch("/api/vendor/apply-event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        // Server-side verification gate (PART 17): send them to the actual
        // verify page instead of surfacing a raw error here.
        if (data.code === "VERIFICATION_REQUIRED") {
          router.push("/vendor/verify");
          return;
        }
        throw new Error(data.error || "Could not apply");
      }
      router.refresh();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Could not apply");
    } finally {
      setApplyingId(null);
    }
  }

  return (
    <div className="container-page py-12 md:py-16">
      <div className="mb-8">
        <h1 className="font-heading text-3xl text-brown-dark">{t("vendor.dashboardTitle")}</h1>
        <p className="text-brown-light text-sm mt-1">
          {t("vendorOverview.welcomeBack")}, {businessName}
        </p>
      </div>

      <div className="flex flex-col md:flex-row gap-8">
        <VendorNav businessName={businessName} />

        <div className="flex-1 min-w-0 space-y-8">
          {notice && (
            <div className="rounded-[10px] bg-amber-50 border border-amber-200 text-amber-900 text-sm px-4 py-3">
              {notice}
            </div>
          )}

          {hasActionItems && (
            <div className="rounded-[10px] border border-amber-300/60 bg-amber-50 p-5">
              <p className="label-caps text-amber-900 mb-3">{t("vendorOverview.actionCentreTitle")}</p>
              <ul className="space-y-2">
                {unviewedWarnings.map((w) => (
                  <li key={w.id}>
                    <Link href="/vendor/profile" className="text-sm text-amber-900 underline">
                      {t("vendorOverview.actionNewWarning")}
                    </Link>
                  </li>
                ))}
                {nearDeadline.map((a) => (
                  <li key={a.id} className="flex items-center gap-2 text-sm text-amber-900">
                    <span>
                      {t("vendorOverview.actionDeadline")} {a.eventName} —
                    </span>
                    {a.acceptanceExpiresAt && <Countdown target={a.acceptanceExpiresAt} />}
                    <Link href={`/vendor/applications/${a.id}`} className="underline">
                      {t("eventDetail.viewApplicationCta")}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <ConfirmedEventsSection events={confirmedEvents} />

          <UpcomingEventsSection events={upcomingEvents} onApply={applyToEvent} applyingId={applyingId} />

          <ApplicationsOverviewSection applications={recentApplications} totalCount={totalApplicationsCount} />

          <div className="rounded-[10px] border border-brown/10 bg-cream p-6 flex items-center justify-between flex-wrap gap-4">
            <div>
              <p className="label-caps">{t("vendor.communityLink")}</p>
              <p className="text-sm text-brown-light mt-1">{t("vendorOverview.communityAlways")}</p>
            </div>
            {communityLink ? (
              <Button size="md" onClick={() => window.open(communityLink, "_blank", "noreferrer")}>
                {t("vendorOverview.joinWhatsapp")}
              </Button>
            ) : (
              <span className="text-sm text-brown-light">{t("vendorOverview.communityNotSet")}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
