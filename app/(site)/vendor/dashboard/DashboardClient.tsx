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
import { Button, LinkButton } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { PhoneVerifyModal } from "@/components/vendor/PhoneVerifyModal";

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
  profileSummary,
}: {
  businessName: string;
  communityLink: string | null;
  confirmedEvents: ConfirmedEventRow[];
  upcomingEvents: UpcomingEventRow[];
  recentApplications: OverviewAppRow[];
  totalApplicationsCount: number;
  unviewedWarnings: { id: string; title: string }[];
  profileSummary: {
    logoUrl: string | null;
    completionPercent: number;
    phoneVerified: boolean;
  };
}) {
  const { t } = useLocale();
  const router = useRouter();
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Set only when an apply attempt is blocked on phone verification — the
  // modal resumes this exact application once verification succeeds,
  // rather than sending the vendor away to find the event again.
  const [verifyForEventId, setVerifyForEventId] = useState<string | null>(null);

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
        // Server-side verification gate — open the inline phone-verify
        // modal right here instead of sending them to a separate page.
        if (data.code === "VERIFICATION_REQUIRED") {
          setVerifyForEventId(eventId);
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

          {/* Compact link to the full Profile page — never a second copy of
              the profile form. Keeps Overview and Profile feeling connected
              without duplicating any editable field here. */}
          <div className="rounded-[10px] border border-brown/10 bg-cream p-5 flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-3 min-w-0">
              {profileSummary.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- vendor-uploaded logo via Blob, not a local static asset
                <img
                  src={profileSummary.logoUrl}
                  alt={businessName}
                  className="w-10 h-10 rounded-full object-cover border border-brown/10 shrink-0"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-cream-deep flex items-center justify-center font-heading text-sm text-brown-dark shrink-0">
                  {businessName.charAt(0).toUpperCase()}
                </div>
              )}
              <div className="min-w-0">
                <p className="label-caps">{t("vendorOverview.profileSummaryTitle")}</p>
                <p className="text-sm text-brown-dark font-medium truncate mt-0.5">{businessName}</p>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span className="text-xs text-brown-light">
                    {t("vendorOverview.profileLabel")} {profileSummary.completionPercent}% {t("vendorOverview.completeSuffix")}
                  </span>
                  <StatusBadge
                    label={profileSummary.phoneVerified ? t("vendorOverview.phoneVerified") : t("vendorOverview.phoneNotVerified")}
                    tone={profileSummary.phoneVerified ? "positive" : "attention"}
                  />
                </div>
              </div>
            </div>
            <LinkButton href="/vendor/profile" variant="secondary" size="md">
              {t("vendorOverview.viewEditProfile")}
            </LinkButton>
          </div>

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

      {verifyForEventId && (
        <PhoneVerifyModal
          onClose={() => setVerifyForEventId(null)}
          onVerified={() => {
            const eventId = verifyForEventId;
            setVerifyForEventId(null);
            if (eventId) applyToEvent(eventId);
          }}
        />
      )}
    </div>
  );
}
