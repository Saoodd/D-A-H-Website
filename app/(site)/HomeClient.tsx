"use client";

import Link from "next/link";
import { useLocale } from "@/lib/i18n/context";

interface NextEvent {
  name: string;
  slug: string;
  location: string;
  startDate: string;
}

export function HomeClient({ nextEvent }: { nextEvent: NextEvent | null }) {
  const { t, locale } = useLocale();

  return (
    <div>
      <section className="relative overflow-hidden bg-cream">
        <div className="container-page py-24 md:py-32 text-center">
          <p className="font-heading text-xs tracking-[0.35em] text-brown-light uppercase mb-5">
            {t("home.heroKicker")}
          </p>
          <h1 className="font-heading font-light text-4xl md:text-6xl text-brown-dark max-w-3xl mx-auto leading-tight">
            {t("home.heroTitle")}
          </h1>
          <p className="mt-6 text-base md:text-lg text-brown-light max-w-xl mx-auto">
            {t("home.heroSubtitle")}
          </p>
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/markets"
              className="px-7 py-3 rounded-full bg-brown text-cream-soft text-sm tracking-wide hover:bg-brown-dark transition-colors"
            >
              {t("home.ctaMarkets")}
            </Link>
            <Link
              href="/vendors"
              className="px-7 py-3 rounded-full border border-brown/40 text-brown text-sm tracking-wide hover:bg-brown/5 transition-colors"
            >
              {t("home.ctaVendors")}
            </Link>
          </div>

          {nextEvent && (
            <div className="mt-14 inline-flex flex-col sm:flex-row items-center gap-3 sm:gap-6 bg-cream-soft border border-brown/10 rounded-2xl px-6 py-4">
              <span className="text-xs uppercase tracking-widest text-brown-light">
                {locale === "ar" ? "القادم" : "Next up"}
              </span>
              <span className="font-heading text-brown">{nextEvent.name}</span>
              <span className="text-sm text-brown-light">
                {new Date(nextEvent.startDate).toLocaleDateString(locale === "ar" ? "ar-AE" : "en-AE", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
                {" · "}
                {nextEvent.location}
              </span>
              <Link href={`/markets/${nextEvent.slug}`} className="text-sm underline text-brown">
                {t("markets.viewDetails")}
              </Link>
            </div>
          )}
        </div>
      </section>

      <section className="container-page py-20 grid md:grid-cols-2 gap-12 items-start">
        <div>
          <h2 className="font-heading text-2xl text-brown-dark mb-4">{t("home.missionTitle")}</h2>
          <p className="text-brown-light leading-relaxed">
            Dar Al Hay (DAH) began with a simple idea: bring Dubai&rsquo;s community closer together
            around good food, thoughtful makers and unhurried afternoons. Every DAH market is
            curated, not just filled &mdash; a small, considered mix of vendors in a warm, boutique
            setting rather than a sprawling trade show.
          </p>
        </div>
        <div>
          <h2 className="font-heading text-2xl text-brown-dark mb-4">{t("home.whatTitle")}</h2>
          <ul className="space-y-3 text-brown-light">
            <li className="flex gap-3">
              <span className="text-brown">—</span>
              Monthly community pop-up markets across Dubai
            </li>
            <li className="flex gap-3">
              <span className="text-brown">—</span>
              A curated, F&amp;B-heavy vendor mix alongside craft &amp; lifestyle makers
            </li>
            <li className="flex gap-3">
              <span className="text-brown">—</span>
              A managed booth application &amp; booking process for every vendor
            </li>
            <li className="flex gap-3">
              <span className="text-brown">—</span>
              A single, connected community &mdash; on the ground and on WhatsApp
            </li>
          </ul>
        </div>
      </section>
    </div>
  );
}
