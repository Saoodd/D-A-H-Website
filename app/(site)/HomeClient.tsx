"use client";

import Link from "next/link";
import { useLocale } from "@/lib/i18n/context";
import { Reveal } from "@/components/Reveal";
import { Typewriter } from "@/components/Typewriter";

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
          <Reveal>
            <p className="font-heading text-xs tracking-[0.35em] text-brown-light uppercase mb-5">
              {t("home.heroKicker")}
            </p>
          </Reveal>
          <h1 className="font-heading font-light text-4xl md:text-6xl text-brown-dark max-w-3xl mx-auto leading-tight min-h-[1.2em]">
            <Typewriter text={t("home.heroTitle")} />
          </h1>
          <Reveal delayMs={150}>
            <p className="mt-6 text-base md:text-lg text-brown-light max-w-xl mx-auto">{t("home.heroSubtitle")}</p>
          </Reveal>
          <Reveal delayMs={300}>
            <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                href="/events"
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
          </Reveal>

          {nextEvent && (
            <Reveal delayMs={450}>
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
                <Link href={`/events/${nextEvent.slug}`} className="text-sm underline text-brown">
                  {t("markets.viewDetails")}
                </Link>
              </div>
            </Reveal>
          )}
        </div>
      </section>

      <section className="container-page py-20 grid md:grid-cols-2 gap-12 items-start">
        <Reveal>
          <h2 className="font-heading text-2xl text-brown-dark mb-4">{t("home.missionTitle")}</h2>
          <p className="text-brown-light leading-relaxed">{t("home.missionBody")}</p>
        </Reveal>
        <Reveal delayMs={150}>
          <h2 className="font-heading text-2xl text-brown-dark mb-4">{t("home.whatTitle")}</h2>
          <ul className="space-y-3 text-brown-light">
            <li className="flex gap-3">
              <span className="text-brown">—</span>
              {t("home.whatItem1")}
            </li>
            <li className="flex gap-3">
              <span className="text-brown">—</span>
              {t("home.whatItem2")}
            </li>
            <li className="flex gap-3">
              <span className="text-brown">—</span>
              {t("home.whatItem3")}
            </li>
            <li className="flex gap-3">
              <span className="text-brown">—</span>
              {t("home.whatItem4")}
            </li>
          </ul>
        </Reveal>
      </section>
    </div>
  );
}
