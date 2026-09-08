"use client";

import Link from "next/link";
import { useLocale } from "@/lib/i18n/context";
import { formatAed } from "@/lib/constants";
import { Reveal } from "@/components/Reveal";

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
        <header className="max-w-2xl mb-12">
          <h1 className="font-heading text-3xl md:text-4xl text-brown-dark">{t("markets.title")}</h1>
          <p className="mt-3 text-brown-light">{t("markets.subtitle")}</p>
        </header>
      </Reveal>

      {events.length === 0 ? (
        <p className="text-brown-light">{t("markets.empty")}</p>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-8">
          {events.map((e, i) => (
            <Reveal key={e.slug} delayMs={(i % 3) * 100}>
              <Link
                href={`/events/${e.slug}`}
                className="group block rounded-2xl overflow-hidden border border-brown/10 bg-cream hover:shadow-lg transition-shadow"
              >
                <div
                  className="h-40 bg-cream-deep bg-cover bg-center"
                  style={e.coverImage ? { backgroundImage: `url(${e.coverImage})` } : undefined}
                />
                <div className="p-6">
                  <p className="text-xs uppercase tracking-widest text-brown-light mb-2">
                    {new Date(e.startDate).toLocaleDateString(locale === "ar" ? "ar-AE" : "en-AE", {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })}
                  </p>
                  <h2 className="font-heading text-xl text-brown-dark group-hover:text-brown">{e.name}</h2>
                  <p className="mt-2 text-sm text-brown-light">{e.location}</p>
                  {e.categories.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
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
