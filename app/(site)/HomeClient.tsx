"use client";

import Image from "next/image";
import Link from "next/link";
import { useLocale } from "@/lib/i18n/context";
import { Reveal } from "@/components/Reveal";

interface NextEvent {
  name: string;
  slug: string;
  location: string;
  startDate: string;
}

interface GalleryPreviewImage {
  id: string;
  url: string;
  caption: string;
}

export function HomeClient({
  nextEvent,
  galleryPreview,
}: {
  nextEvent: NextEvent | null;
  galleryPreview: GalleryPreviewImage[];
}) {
  const { t, locale, dir } = useLocale();
  const isRtl = dir === "rtl";

  return (
    <div>
      {/* HERO — full-viewport, photo-first. The crowd photo IS the
          background (not split, not boxed); a bottom-anchored gradient
          gives the text a guaranteed-legible zone without flattening the
          rest of the image, and a short top gradient does the same for
          the transparent nav (see HomeHeader). Content is bottom-anchored
          via flex so mobile never needs a scroll to see the CTAs. */}
      <section className="relative min-h-[100dvh] flex flex-col justify-end overflow-hidden bg-black">
        <Image
          src="/images/hero-crowd.webp"
          alt={
            locale === "ar"
              ? "حشد من الزوار يتجول بين أكشاك البائعين في إحدى فعاليات دار الحي"
              : "A crowd of visitors browsing vendor stalls at a Dar Al Hay event"
          }
          fill
          priority
          sizes="100vw"
          className="object-cover hero-photo-ambient"
        />
        {/* Bottom scrim — the only place text sits — fading up from ~65%
            opacity at the very bottom to fully clear by mid-image, so the
            crowd, stalls and lights above stay bright and untouched. */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[70%] bg-gradient-to-t from-black/85 via-black/25 to-transparent" />
        {/* Short top scrim, for nav legibility only. */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-black/50 to-transparent" />

        <div className="relative container-page pb-16 sm:pb-20 md:pb-24 pt-24 md:pt-28">
          <Reveal>
            <p className="text-[11px] sm:text-xs font-semibold uppercase tracking-[0.28em] text-white/80 mb-3 md:mb-5">
              {t("home.heroKicker")}
            </p>
          </Reveal>

          <Reveal delayMs={100}>
            <h1
              className="font-heading font-light text-white text-[2.1rem] sm:text-5xl md:text-6xl leading-[1.1] tracking-tight max-w-3xl md:max-w-4xl lg:max-w-5xl"
              style={{ textWrap: "balance" }}
            >
              {t("home.heroTitle")}
            </h1>
          </Reveal>

          <Reveal delayMs={200}>
            <p className="mt-3 md:mt-6 text-base md:text-lg text-white/75 max-w-md leading-relaxed">
              {t("home.heroSubtitle")}
            </p>
          </Reveal>

          <Reveal delayMs={300}>
            <div className="mt-5 md:mt-10 flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4">
              <Link
                href="/events"
                className="group inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-full bg-white text-black text-sm font-medium tracking-wide hover:bg-white/90 active:scale-[0.98] transition-all"
              >
                {t("home.ctaMarkets")}
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                  fill="none"
                  aria-hidden="true"
                  className={`shrink-0 transition-transform group-hover:translate-x-0.5 ${isRtl ? "-scale-x-100" : ""}`}
                >
                  <path
                    d="M3 8h10M9 4l4 4-4 4"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </Link>
              <Link
                href="/vendors"
                className="inline-flex items-center justify-center px-7 py-3.5 rounded-full border border-white/40 text-white text-sm font-medium tracking-wide hover:bg-white/10 hover:border-white/60 active:scale-[0.98] transition-all"
              >
                {t("home.ctaVendors")}
              </Link>
            </div>
          </Reveal>

          {nextEvent && (
            <Reveal delayMs={450}>
              <div className="mt-6 md:mt-11 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-white/20 pt-3 md:pt-4 max-w-2xl">
                <span className="inline-flex items-center gap-1.5">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="absolute inline-flex h-full w-full rounded-full bg-accent opacity-75 animate-ping" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent" />
                  </span>
                  <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-[0.2em] text-white/55">
                    {locale === "ar" ? "القادم" : "Next"}
                  </span>
                </span>
                <span className="text-sm sm:text-base text-white font-medium">{nextEvent.name}</span>
                <span className="text-white/40">·</span>
                <span className="text-xs sm:text-sm text-white/65">
                  {new Date(nextEvent.startDate).toLocaleDateString(locale === "ar" ? "ar-AE" : "en-AE", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                  {" · "}
                  {nextEvent.location}
                </span>
                <Link
                  href={`/events/${nextEvent.slug}`}
                  className="text-xs sm:text-sm text-white underline underline-offset-2 decoration-white/40 hover:decoration-white transition-colors"
                >
                  {t("markets.viewDetails")}
                </Link>
              </div>
            </Reveal>
          )}
        </div>

        <div className="hidden md:flex absolute inset-x-0 bottom-5 justify-center pointer-events-none">
          <svg
            width="20"
            height="20"
            viewBox="0 0 20 20"
            fill="none"
            aria-hidden="true"
            className="animate-bounce text-white/50"
          >
            <path d="M5 8l5 5 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </section>

      {/* ABOUT — a single large editorial statement, no card, no icon grid. */}
      <section className="bg-cream-soft">
        <div className="container-page py-24 md:py-32">
          <Reveal>
            <p className="text-[11px] sm:text-xs font-semibold uppercase tracking-[0.28em] text-brown-light mb-6">
              {t("home.missionTitle")}
            </p>
          </Reveal>
          <Reveal delayMs={100}>
            <p className="font-heading font-light text-ink text-3xl sm:text-4xl md:text-5xl leading-[1.3] max-w-4xl">
              {t("home.missionBody")}
            </p>
          </Reveal>
        </div>
      </section>

      {/* WHAT WE DO — numbered, rule-separated, no cards. */}
      <section className="bg-cream-soft border-t border-brown/10">
        <div className="container-page py-20 md:py-28">
          <Reveal>
            <h2 className="font-heading text-2xl md:text-3xl text-ink mb-12 md:mb-16">{t("home.whatTitle")}</h2>
          </Reveal>
          <div className="grid md:grid-cols-2 gap-x-14 gap-y-10 md:gap-y-12">
            {([1, 2, 3, 4] as const).map((n, i) => (
              <Reveal key={n} delayMs={i * 100}>
                <div className="flex gap-5 border-t border-brown/15 pt-6">
                  <span className="font-heading text-sm text-brown-light shrink-0">0{n}</span>
                  <p className="text-ink leading-relaxed">{t(`home.whatItem${n}`)}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* GALLERY — full-bleed photo grid, minimal gaps, no rounding. */}
      {galleryPreview.length > 0 && (
        <section className="bg-black">
          <div className="container-page py-20 md:py-28">
            <Reveal>
              <div className="flex items-end justify-between mb-10 md:mb-14">
                <h2 className="font-heading text-2xl md:text-3xl text-white">{t("home.galleryTitle")}</h2>
                <Link
                  href="/gallery"
                  className="text-sm text-white/70 hover:text-white underline underline-offset-2 whitespace-nowrap transition-colors"
                >
                  {t("home.galleryCta")}
                </Link>
              </div>
            </Reveal>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5 md:gap-2">
              {galleryPreview.map((img, i) => (
                <Reveal key={img.id} delayMs={(i % 4) * 80}>
                  <div className="group overflow-hidden aspect-[4/5]">
                    {/* eslint-disable-next-line @next/next/no-img-element -- admin-managed external URLs, not local static assets */}
                    <img
                      src={img.url}
                      alt={img.caption || "Dar Al Hay event"}
                      className="w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-110"
                    />
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* FINAL CTA — bold closing band. */}
      <section className="bg-black text-white">
        <div className="container-page py-24 md:py-32 text-center">
          <Reveal>
            <p className="text-[11px] sm:text-xs font-semibold uppercase tracking-[0.28em] text-white/50 mb-6">
              {t("home.heroKicker")}
            </p>
          </Reveal>
          <Reveal delayMs={100}>
            <h2 className="font-heading font-light text-3xl sm:text-4xl md:text-5xl leading-tight max-w-3xl mx-auto">
              {t("home.finalCtaTitle")}
            </h2>
          </Reveal>
          <Reveal delayMs={200}>
            <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                href="/vendors"
                className="px-8 py-3.5 rounded-full bg-white text-black text-sm font-medium tracking-wide hover:bg-white/90 active:scale-[0.98] transition-all"
              >
                {t("home.ctaVendors")}
              </Link>
              <Link
                href="/events"
                className="px-8 py-3.5 rounded-full border border-white/40 text-white text-sm font-medium tracking-wide hover:bg-white/10 hover:border-white/60 active:scale-[0.98] transition-all"
              >
                {t("home.ctaMarkets")}
              </Link>
            </div>
          </Reveal>
        </div>
      </section>
    </div>
  );
}
