"use client";

import Link from "next/link";
import { useLocale } from "@/lib/i18n/context";
import { formatAed } from "@/lib/constants";

interface EventDetail {
  slug: string;
  name: string;
  description: string;
  location: string;
  startDate: string;
  endDate: string | null;
  coverImage: string | null;
  categoryNeeds: string;
  minPriceAedFils: number | null;
}

export function EventDetailClient({ event }: { event: EventDetail }) {
  const { t, locale } = useLocale();

  const dateFmt = (iso: string) =>
    new Date(iso).toLocaleDateString(locale === "ar" ? "ar-AE" : "en-AE", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });

  return (
    <div>
      <div
        className="h-56 md:h-80 bg-cream-deep bg-cover bg-center"
        style={event.coverImage ? { backgroundImage: `url(${event.coverImage})` } : undefined}
      />
      <div className="container-page py-14 max-w-3xl">
        <h1 className="font-heading text-3xl md:text-4xl text-brown-dark">{event.name}</h1>
        <p className="mt-3 text-brown-light">
          {dateFmt(event.startDate)}
          {event.endDate ? ` — ${dateFmt(event.endDate)}` : ""}
        </p>
        <p className="text-brown-light">{event.location}</p>

        {event.description && (
          <p className="mt-6 leading-relaxed text-ink whitespace-pre-line">{event.description}</p>
        )}

        {event.categoryNeeds && (
          <div className="mt-6 text-sm text-brown-light">
            <span className="font-medium text-brown">
              {locale === "ar" ? "الفئات المطلوبة: " : "Vendor categories needed: "}
            </span>
            {event.categoryNeeds}
          </div>
        )}

        {event.minPriceAedFils != null && (
          <p className="mt-2 text-sm text-brown">
            {t("markets.from")} {formatAed(event.minPriceAedFils)}
          </p>
        )}

        <div className="mt-10">
          <Link
            href={`/vendors?event=${event.slug}`}
            className="inline-block px-7 py-3 rounded-full bg-brown text-cream-soft text-sm tracking-wide hover:bg-brown-dark transition-colors"
          >
            {t("markets.apply")}
          </Link>
        </div>
      </div>
    </div>
  );
}
