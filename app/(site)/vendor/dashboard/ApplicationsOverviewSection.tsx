"use client";

import Link from "next/link";
import { useLocale } from "@/lib/i18n/context";
import { Countdown } from "@/components/Countdown";
import { DisplayStatus } from "@/lib/constants";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { LinkButton } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/Card";

export interface OverviewAppRow {
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

function actionLabel(status: DisplayStatus, locale: string) {
  if (status === "ACCEPTED_UNPAID") return locale === "ar" ? "متابعة الحجز" : "Continue Booking";
  if (status === "PAID") return locale === "ar" ? "عرض الحجز" : "View Booking";
  if (status === "PENDING") return locale === "ar" ? "عرض الطلب" : "View Application";
  return locale === "ar" ? "التفاصيل" : "View Details";
}

/** Concise, recent-first slice of the vendor's applications, shown directly
 *  on Overview so they never have to leave the page for the common cases —
 *  the full history remains one click away at /vendor/applications. */
export function ApplicationsOverviewSection({
  applications,
  totalCount,
}: {
  applications: OverviewAppRow[];
  totalCount: number;
}) {
  const { t, locale } = useLocale();
  const dateFmt = (iso: string) => new Date(iso).toLocaleDateString(locale === "ar" ? "ar-AE" : "en-AE");

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-3">
        <p className="label-caps">{locale === "ar" ? "طلباتك" : "Your Applications"}</p>
        {totalCount > applications.length && (
          <Link href="/vendor/applications" className="text-xs text-brown underline shrink-0">
            {locale === "ar" ? "عرض كل الطلبات" : "View All Applications"}
          </Link>
        )}
      </div>

      {applications.length === 0 ? (
        <EmptyState title={t("vendorOverview.applicationsEmpty")} />
      ) : (
        <div className="space-y-3">
          {applications.map((app) => (
            <div
              key={app.id}
              className="flex items-center justify-between flex-wrap gap-3 rounded-[10px] border border-brown/10 bg-cream p-5"
            >
              <div className="min-w-0">
                <p className="font-heading text-brown-dark">{app.eventName}</p>
                <div className="flex items-center gap-2 flex-wrap mt-1">
                  <span className="text-xs text-brown-light">{dateFmt(app.eventStartDate)}</span>
                  <StatusBadge label={t(`vendor.status.${app.displayStatus}`)} tone={statusTone[app.displayStatus]} />
                  {app.displayStatus === "ACCEPTED_UNPAID" && app.acceptanceExpiresAt && (
                    <span className="text-xs text-brown-light">
                      {t("vendor.deadlineLabel")} <Countdown target={app.acceptanceExpiresAt} />
                    </span>
                  )}
                </div>
              </div>
              <LinkButton href={`/vendor/applications/${app.id}`} size="sm" variant="secondary">
                {actionLabel(app.displayStatus, locale)}
              </LinkButton>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
