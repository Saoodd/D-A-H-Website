"use client";

import Link from "next/link";
import { useLocale } from "@/lib/i18n/context";
import { formatAed } from "@/lib/constants";
import { Reveal } from "@/components/Reveal";
import { PageHeader, EmptyState } from "@/components/ui/Card";

interface EventCard {
  slug: string;
  name: string;
  description: string;
  location: string;
  startDate: string;
  coverImage: string | null;
  categories: string[];
  minPriceAedFils: number | null;
}

export function EventsClient({ events }: { events: EventCard[] }) {
  const { t, locale } = useLocale();

  return (
    <div className="container-page py-16">
      <Reveal>
        <PageHeader title={t("markets.title")} description={t("markets.subtitle")} />
      </Reveal>

      {events.length === 0 ? (
        <EmptyState title={t("markets.empty")} />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {events.map((e, i) => (
            <Reveal key={e.slug} delayMs={(i % 3) * 100}>
              <Link
                href={`/events/${e.slug}`}
                className="group block rounded-[10px] overflow-hidden border border-brown/10 bg-cream hover:border-brown/25 transition-colors"
              >
                <div
                  className="h-40 bg-cream-deep bg-cover bg-center"
                  style={e.coverImage ? { backgroundImage: `url(${e.coverImage})` } : undefined}
                />
                <div className="p-6">
                  <p className="label-caps mb-2">
                    {new Date(e.startDate).toLocaleDateString(locale === "ar" ? "ar-AE" : "en-AE", {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })}
                  </p>
                  <h2 className="font-heading text-xl text-brown-dark group-hover:text-brown transition-colors">{e.name}</h2>
                  <p className="mt-2 text-sm text-brown-light">{e.location}</p>
                  {e.categories.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {e.categories.map((c) => (
                        <span key={c} className="text-[11px] bg-cream-deep text-brown-dark rounded-full px-2.5 py-0.5">
                          {c}
                        </span>
                      ))}
                    </div>
                  )}
                  {e.minPriceAedFils != null && (
                    <p className="mt-4 text-sm text-brown">
                      {t("markets.from")} {formatAed(e.minPriceAedFils)}
                    </p>
                  )}
                </div>
              </Link>
            </Reveal>
          ))}
        </div>
      )}
    </div>
  );
}
