"use client";

import Link from "next/link";
import { useLocale } from "@/lib/i18n/context";
import { Countdown } from "@/components/Countdown";
import { DisplayStatus } from "@/lib/constants";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/Card";

interface AppRow {
  id: string;
  eventName: string;
  eventStartDate: string;
  displayStatus: DisplayStatus;
  acceptanceExpiresAt: string | null;
}

const statusTone: Record<DisplayStatus, "neutral" | "positive" | "attention" | "negative"> = {
  PENDING: "neutral",
  REJECTED: "negative",
  ACCEPTED_UNPAID: "attention",
  PAID: "positive",
  EXPIRED: "neutral",
};

export function ApplicationsListClient({ applications }: { applications: AppRow[] }) {
  const { t, locale } = useLocale();
  const dateFmt = (iso: string) => new Date(iso).toLocaleDateString(locale === "ar" ? "ar-AE" : "en-AE");

  return (
    <div className="max-w-2xl">
      <Link href="/vendor/dashboard" className="text-xs text-brown-light underline">
        {locale === "ar" ? "العودة إلى النظرة العامة" : "← Back to Overview"}
      </Link>
      <h1 className="font-heading text-2xl text-brown-dark mt-3 mb-1">
        {locale === "ar" ? "طلباتك" : "Your Applications"}
      </h1>
      <p className="text-sm text-brown-light mb-8">
        {locale === "ar" ? "كل طلب قدّمته إلى فعاليات دار الحي." : "Every application you've submitted to a DAH event."}
      </p>

      {applications.length === 0 ? (
        <EmptyState title={t("vendorOverview.applicationsEmpty")} />
      ) : (
        <div className="space-y-3">
          {applications.map((app) => (
            <Link
              key={app.id}
              href={`/vendor/applications/${app.id}`}
              className="block rounded-[10px] border border-brown/10 bg-cream hover:border-brown/25 p-5 transition-colors"
            >
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <p className="font-heading text-brown-dark">{app.eventName}</p>
                  <p className="text-xs text-brown-light">{dateFmt(app.eventStartDate)}</p>
                </div>
                <div className="flex items-center gap-3">
                  {app.displayStatus === "ACCEPTED_UNPAID" && app.acceptanceExpiresAt && (
                    <span className="text-xs text-brown-light">
                      {t("vendor.deadlineLabel")} <Countdown target={app.acceptanceExpiresAt} />
                    </span>
                  )}
                  <StatusBadge label={t(`vendor.status.${app.displayStatus}`)} tone={statusTone[app.displayStatus]} />
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
