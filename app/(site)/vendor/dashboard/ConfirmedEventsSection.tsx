"use client";

import Link from "next/link";
import { useLocale } from "@/lib/i18n/context";
import { formatAed } from "@/lib/constants";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { LinkButton } from "@/components/ui/Button";

export interface ConfirmedEventRow {
  applicationId: string;
  eventId: string;
  eventName: string;
  eventSlug: string;
  coverImage: string | null;
  startDate: string;
  endDate: string | null;
  location: string;
  boothCode: string;
  boothSize: string;
  amountAedFils: number;
  paidAt: string | null;
  whatsappVendorGroupLink: string | null;
}

const PLACEHOLDER_CLASS =
  "bg-cream-deep bg-[repeating-linear-gradient(45deg,rgba(107,68,41,0.04),rgba(107,68,41,0.04)_10px,transparent_10px,transparent_20px)]";

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

// A quiet, static "in N days" line — deliberately not the live MM:SS
// Countdown component used for the short booth-selection/payment timers
// elsewhere, since a days-away event doesn't need second-by-second urgency.
function daysUntilLabel(startIso: string, locale: string) {
  const now = new Date();
  const start = new Date(startIso);
  const days = Math.ceil((start.setHours(0, 0, 0, 0) - now.setHours(0, 0, 0, 0)) / 86_400_000);
  if (days < 0) return null;
  if (days === 0) return locale === "ar" ? "اليوم" : "Today";
  if (days === 1) return locale === "ar" ? "غداً" : "Tomorrow";
  return locale === "ar" ? `خلال ${days} يوماً` : `In ${days} days`;
}

/** The featured, booking-focused card for a vendor's closest confirmed/paid
 *  upcoming event — deliberately more detailed and visually heavier than the
 *  discovery-oriented Upcoming DAH Events grid below it. Restrained
 *  confirmation styling throughout (muted StatusBadge, not a bright green
 *  success box) to match the rest of the DAH design system. */
function FeaturedConfirmedCard({ ev }: { ev: ConfirmedEventRow }) {
  const { locale } = useLocale();
  const countdown = daysUntilLabel(ev.startDate, locale);

  return (
    <div className="rounded-[12px] overflow-hidden border border-brown/10 bg-cream flex flex-col md:flex-row">
      <div
        className={`h-48 md:h-auto md:w-[42%] shrink-0 bg-cover bg-center ${ev.coverImage ? "" : PLACEHOLDER_CLASS}`}
        style={ev.coverImage ? { backgroundImage: `url(${ev.coverImage})` } : undefined}
      />
      <div className="p-7 sm:p-8 flex-1 min-w-0">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <StatusBadge label={locale === "ar" ? "مؤكد ومدفوع" : "Confirmed & Paid"} tone="positive" />
          {countdown && <span className="text-xs text-brown-light">{countdown}</span>}
        </div>

        <Link href={`/events/${ev.eventSlug}`} className="block mt-3">
          <h3 className="font-heading text-2xl sm:text-3xl text-brown-dark hover:text-brown transition-colors">{ev.eventName}</h3>
        </Link>
        <p className="text-sm text-brown-light mt-1.5">
          {formatDateRange(ev.startDate, ev.endDate, locale)} · {ev.location}
        </p>

        <div className="grid grid-cols-3 gap-4 mt-6 pt-6 border-t border-brown/10">
          <div>
            <p className="label-caps text-[10px]">{locale === "ar" ? "الكشك" : "Booth"}</p>
            <p className="font-heading text-lg text-brown-dark mt-1">{ev.boothCode}</p>
          </div>
          <div>
            <p className="label-caps text-[10px]">{locale === "ar" ? "المساحة" : "Size"}</p>
            <p className="font-heading text-lg text-brown-dark mt-1">{ev.boothSize}</p>
          </div>
          <div>
            <p className="label-caps text-[10px]">{locale === "ar" ? "المبلغ المدفوع" : "Amount Paid"}</p>
            <p className="font-heading text-lg text-brown-dark mt-1">{formatAed(ev.amountAedFils)}</p>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <LinkButton href={`/vendor/applications/${ev.applicationId}`} size="lg">
            {locale === "ar" ? "عرض الحجز" : "View Booking"}
          </LinkButton>
          {ev.whatsappVendorGroupLink && (
            <a
              href={ev.whatsappVendorGroupLink}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center px-7 py-3 rounded-full border border-brown/25 text-brown-dark text-sm tracking-wide hover:bg-brown/5 transition-colors"
            >
              {locale === "ar" ? "انضم لمجموعة البائعين" : "Join Vendor Group"}
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

/** Smaller companion card used for additional confirmed events beyond the
 *  featured one — same booking-focused facts, lower visual weight, never
 *  mixed into the discovery-oriented Upcoming DAH Events grid. */
function CompactConfirmedCard({ ev }: { ev: ConfirmedEventRow }) {
  const { locale } = useLocale();

  return (
    <div className="rounded-[10px] overflow-hidden border border-brown/10 bg-cream flex flex-col">
      <div
        className={`h-32 bg-cover bg-center ${ev.coverImage ? "" : PLACEHOLDER_CLASS}`}
        style={ev.coverImage ? { backgroundImage: `url(${ev.coverImage})` } : undefined}
      />
      <div className="p-5 flex flex-col flex-1">
        <StatusBadge label={locale === "ar" ? "مؤكد ومدفوع" : "Confirmed & Paid"} tone="positive" className="self-start" />
        <h4 className="font-heading text-lg text-brown-dark mt-2.5">{ev.eventName}</h4>
        <p className="text-xs text-brown-light mt-1">
          {formatDateRange(ev.startDate, ev.endDate, locale)} · {ev.location}
        </p>
        <p className="text-xs text-brown-light mt-1">
          {locale === "ar" ? "الكشك" : "Booth"} {ev.boothCode} ({ev.boothSize})
        </p>
        <div className="mt-4 pt-4 border-t border-brown/10 mt-auto flex flex-wrap gap-2.5">
          <LinkButton href={`/vendor/applications/${ev.applicationId}`} size="sm">
            {locale === "ar" ? "عرض الحجز" : "View Booking"}
          </LinkButton>
          {ev.whatsappVendorGroupLink && (
            <a
              href={ev.whatsappVendorGroupLink}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center px-3.5 py-1.5 rounded-full border border-brown/25 text-brown-dark text-xs tracking-wide hover:bg-brown/5 transition-colors"
            >
              {locale === "ar" ? "مجموعة البائعين" : "Vendor Group"}
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

export function ConfirmedEventsSection({ events }: { events: ConfirmedEventRow[] }) {
  const { locale } = useLocale();
  if (events.length === 0) return null;

  const [featured, ...rest] = events;

  return (
    <div>
      <h2 className="label-caps mb-3">
        {events.length > 1
          ? locale === "ar"
            ? "فعالياتك المؤكدة"
            : "Your Confirmed Events"
          : locale === "ar"
          ? "فعاليتك القادمة المؤكدة"
          : "Your Next Confirmed Event"}
      </h2>
      <FeaturedConfirmedCard ev={featured} />
      {rest.length > 0 && (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-5 mt-5">
          {rest.map((ev) => (
            <CompactConfirmedCard key={ev.applicationId} ev={ev} />
          ))}
        </div>
      )}
    </div>
  );
}
