"use client";

import Link from "next/link";
import { useLocale } from "@/lib/i18n/context";
import { DisplayStatus, formatAed } from "@/lib/constants";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/Card";

export interface UpcomingEventRow {
  id: string;
  slug: string;
  name: string;
  location: string;
  coverImage: string | null;
  startDate: string;
  endDate: string | null;
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

// Same subtle diagonal-stripe DAH placeholder used on the public Events
// page (app/(site)/events/EventsClient.tsx) when a cover image is missing
// — never a stock photo, and never the same flat rectangle across both
// surfaces.
const PLACEHOLDER_CLASS = "bg-cream-deep bg-[repeating-linear-gradient(45deg,rgba(107,68,41,0.04),rgba(107,68,41,0.04)_10px,transparent_10px,transparent_20px)]";

function formatDateRange(startIso: string, endIso: string | null, locale: string) {
  const start = new Date(startIso);
  const localeTag = locale === "ar" ? "ar-AE" : "en-AE";
  if (!endIso) return start.toLocaleDateString(localeTag, { day: "numeric", month: "long", year: "numeric" });
  const end = new Date(endIso);
  const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();
  if (sameMonth) {
    return `${start.getDate()}–${end.toLocaleDateString(localeTag, { day: "numeric", month: "long", year: "numeric" })}`;
  }
  return `${start.toLocaleDateString(localeTag, { day: "numeric", month: "long" })} – ${end.toLocaleDateString(localeTag, {
    day: "numeric",
    month: "long",
    year: "numeric",
  })}`;
}

// The main visual anchor of the Overview page — large, premium cards, not a
// narrow row. Every event the vendor can act on shows here with a clear
// status-aware CTA alongside a neutral "View Details" link to the public
// event page.
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

  return (
    <div>
      <h2 className="label-caps mb-3">{locale === "ar" ? "فعاليات دار الحي القادمة" : "Upcoming DAH Events"}</h2>
      {events.length === 0 ? (
        <EmptyState title={locale === "ar" ? "لا توجد فعاليات قادمة منشورة حالياً" : "No upcoming events published yet"} />
      ) : (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-5">
          {events.map((ev) => (
            <div key={ev.id} className="rounded-[10px] overflow-hidden border border-brown/10 bg-cream flex flex-col">
              <div
                className={`h-40 sm:h-48 bg-cover bg-center ${ev.coverImage ? "" : PLACEHOLDER_CLASS}`}
                style={ev.coverImage ? { backgroundImage: `url(${ev.coverImage})` } : undefined}
              />
              <div className="p-6 flex flex-col flex-1">
                <h3 className="font-heading text-xl text-brown-dark">{ev.name}</h3>
                <p className="text-sm text-brown-light mt-1.5">{formatDateRange(ev.startDate, ev.endDate, locale)}</p>
                <p className="text-sm text-brown-light">{ev.location}</p>

                <div className="mt-3 flex items-center gap-2 flex-wrap">
                  {ev.minPriceAedFils != null && (
                    <span className="text-sm text-brown font-medium">
                      {locale === "ar" ? "من" : "From"} {formatAed(ev.minPriceAedFils)}
                    </span>
                  )}
                  {ev.displayStatus && <StatusBadge label={t(`vendor.status.${ev.displayStatus}`)} tone={statusTone[ev.displayStatus]} />}
                </div>

                <div className="mt-5 pt-5 border-t border-brown/10 flex flex-wrap gap-2.5 mt-auto">
                  <Link href={`/events/${ev.slug}`}>
                    <Button size="md" variant="secondary">
                      {locale === "ar" ? "التفاصيل" : "View Details"}
                    </Button>
                  </Link>
                  {ev.applicationId ? (
                    <Link href={`/vendor/applications/${ev.applicationId}`}>
                      <Button size="md">
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
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
