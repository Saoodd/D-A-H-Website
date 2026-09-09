"use client";

import Link from "next/link";
import { useLocale } from "@/lib/i18n/context";
import { DisplayStatus, formatAed } from "@/lib/constants";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/Card";

export interface UpcomingEventRow {
  id: string;
  name: string;
  location: string;
  startDate: string;
  minPriceAedFils: number | null;
  applicationId: string | null;
  displayStatus: DisplayStatus | null;
}

const statusTone: Record<DisplayStatus, "neutral" | "positive" | "attention" | "negative"> = {
  PENDING: "neutral",
  REJECTED: "negative",
  ACCEPTED_UNPAID: "attention",
  PAID: "positive",
  EXPIRED: "neutral",
};

// Every upcoming published event, whether or not this vendor has applied
// yet — so the dashboard Overview gives a useful snapshot immediately
// instead of sending them hunting through the separate Events tab. CTA per
// row: no application → Apply; PENDING → View Application; accepted-unpaid
// → Continue Booking; paid → View Booking; rejected/expired → View
// Application (so they can still see the outcome).
export function UpcomingEventsSection({
  events,
  onApply,
  applyingId,
}: {
  events: UpcomingEventRow[];
  onApply: (eventId: string) => void;
  applyingId: string | null;
}) {
  const { t, locale } = useLocale();
  const dateFmt = (iso: string) => new Date(iso).toLocaleDateString(locale === "ar" ? "ar-AE" : "en-AE");

  return (
    <div>
      <p className="label-caps mb-3">{locale === "ar" ? "فعاليات دار الحي القادمة" : "Upcoming DAH Events"}</p>
      {events.length === 0 ? (
        <EmptyState title={locale === "ar" ? "لا توجد فعاليات قادمة منشورة حالياً" : "No upcoming events published yet"} />
      ) : (
        <div className="space-y-3">
          {events.map((ev) => (
            <div key={ev.id} className="flex items-center justify-between flex-wrap gap-3 rounded-[10px] border border-brown/10 bg-cream p-5">
              <div>
                <p className="font-heading text-brown-dark">{ev.name}</p>
                <p className="text-xs text-brown-light mt-0.5">
                  {dateFmt(ev.startDate)} · {ev.location}
                  {ev.minPriceAedFils != null && ` · ${locale === "ar" ? "من" : "From"} ${formatAed(ev.minPriceAedFils)}`}
                </p>
                {ev.displayStatus && (
                  <div className="mt-1.5">
                    <StatusBadge label={t(`vendor.status.${ev.displayStatus}`)} tone={statusTone[ev.displayStatus]} />
                  </div>
                )}
              </div>

              {ev.applicationId ? (
                <Link href={`/vendor/applications/${ev.applicationId}`}>
                  <Button size="md" variant="secondary">
                    {ev.displayStatus === "ACCEPTED_UNPAID"
                      ? locale === "ar"
                        ? "متابعة الحجز"
                        : "Continue Booking"
                      : ev.displayStatus === "PAID"
                      ? locale === "ar"
                        ? "عرض الحجز"
                        : "View Booking"
                      : t("eventDetail.viewApplicationCta")}
                  </Button>
                </Link>
              ) : (
                <Button size="md" onClick={() => onApply(ev.id)} loading={applyingId === ev.id}>
                  {applyingId === ev.id ? t("vendorOverview.applying") : t("vendorOverview.applyCta")}
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
