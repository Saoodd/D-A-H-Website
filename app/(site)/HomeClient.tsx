"use client";

import Image from "next/image";
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
      {/* HERO — editorial split: real DAH event photography on one side, the
          brand/message in its own clean, always-legible panel on the other.
          The image never carries text, so it can stay bright and fully
          visible (crowd, stalls, lights, scale) at any crop. On mobile the
          two stack (photo first, content directly under it) instead of
          sitting side by side. DOM order is [photo, content] everywhere —
          that alone gives the correct mobile stack AND, in a 2-col grid,
          the correct physical left/right placement in both LTR and RTL
          (CSS Grid places track 1 at the inline-start edge, which mirrors
          automatically with the page's dir). */}
      <section className="relative bg-cream overflow-hidden">
        <div className="grid md:grid-cols-2 md:min-h-[620px] lg:min-h-[680px]">
          <div className="relative h-[36vh] min-h-[220px] max-h-[320px] md:h-full md:min-h-0 md:max-h-none">
            <Image
              src="/images/hero-crowd.webp"
              alt={
                locale === "ar"
                  ? "حشد من الزوار يتجول بين أكشاك البائعين في إحدى فعاليات دار الحي"
                  : "A crowd of visitors browsing vendor stalls at a Dar Al Hay event"
              }
              fill
              priority
              sizes="(min-width: 768px) 50vw, 100vw"
              className="object-cover hero-photo-ambient"
            />
            {/* Purely cosmetic, very light vignette — never darkens the
                subject matter, just softens the hard crop edges so the
                photo reads as "designed into" the layout rather than
                dropped on top of it. No text ever sits on this layer. */}
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/12 via-transparent to-transparent md:bg-gradient-to-r md:from-transparent md:to-black/[0.06]" />
          </div>

          <div className="relative flex flex-col justify-center px-5 sm:px-8 md:px-10 lg:px-16 py-8 md:py-16">
            <Reveal>
              <p className="label-caps mb-3 md:mb-5">{t("home.heroKicker")}</p>
            </Reveal>

            <h1 className="font-heading font-light text-4xl sm:text-5xl lg:text-[3.15rem] text-brown-dark leading-[1.1] min-h-[3.6em] sm:min-h-[3.3em] lg:min-h-[3.45em]">
              <Typewriter text={t("home.heroTitle")} />
            </h1>

            <Reveal delayMs={150}>
              <p className="mt-4 md:mt-5 text-base md:text-lg text-brown-light max-w-md leading-relaxed">
                {t("home.heroSubtitle")}
              </p>
            </Reveal>

            <Reveal delayMs={300}>
              <div className="mt-6 md:mt-8 flex flex-col lg:flex-row gap-3 sm:gap-4">
                <Link
                  href="/events"
                  className="group inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-full bg-brown text-cream-soft text-sm font-medium tracking-wide shadow-sm hover:bg-brown-dark hover:shadow-md active:scale-[0.98] transition-all"
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
                  className="inline-flex items-center justify-center px-7 py-3.5 rounded-full border border-brown/30 text-brown-dark text-sm font-medium tracking-wide hover:bg-brown/5 hover:border-brown/50 active:scale-[0.98] transition-all"
                >
                  {t("home.ctaVendors")}
                </Link>
              </div>
            </Reveal>

            {nextEvent && (
              <Reveal delayMs={450}>
                <div className="mt-7 md:mt-9 flex flex-col gap-2 bg-cream-soft border border-brown/10 rounded-2xl px-5 py-4 max-w-md">
                  <span className="label-caps">{locale === "ar" ? "القادم" : "Next up"}</span>
                  <span className="font-heading text-lg text-brown-dark">{nextEvent.name}</span>
                  <span className="text-sm text-brown-light">
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
                    className="mt-1 text-sm underline text-brown w-fit hover:text-brown-dark transition-colors"
                  >
                    {t("markets.viewDetails")}
                  </Link>
                </div>
              </Reveal>
            )}
          </div>
        </div>
      </section>

      <section className="container-page py-20 grid md:grid-cols-2 gap-12 md:gap-16 items-start">
        <Reveal>
          <h2 className="font-heading text-2xl text-brown-dark mb-4">{t("home.missionTitle")}</h2>
          <p className="text-brown-light leading-relaxed">{t("home.missionBody")}</p>
        </Reveal>
        <Reveal delayMs={150}>
          <h2 className="font-heading text-2xl text-brown-dark mb-4">{t("home.whatTitle")}</h2>
          <ul className="space-y-4 text-brown-light">
            <li className="flex gap-3">
              <span className="mt-2 h-1.5 w-1.5 rounded-full bg-accent shrink-0" aria-hidden="true" />
              {t("home.whatItem1")}
            </li>
            <li className="flex gap-3">
              <span className="mt-2 h-1.5 w-1.5 rounded-full bg-accent shrink-0" aria-hidden="true" />
              {t("home.whatItem2")}
            </li>
            <li className="flex gap-3">
              <span className="mt-2 h-1.5 w-1.5 rounded-full bg-accent shrink-0" aria-hidden="true" />
              {t("home.whatItem3")}
            </li>
            <li className="flex gap-3">
              <span className="mt-2 h-1.5 w-1.5 rounded-full bg-accent shrink-0" aria-hidden="true" />
              {t("home.whatItem4")}
            </li>
          </ul>
        </Reveal>
      </section>

      {galleryPreview.length > 0 && (
        <section className="container-page pb-20">
          <Reveal>
            <div className="flex items-end justify-between mb-6">
              <h2 className="font-heading text-2xl text-brown-dark">{t("home.galleryTitle")}</h2>
              <Link
                href="/gallery"
                className="text-sm underline text-brown hover:text-brown-dark transition-colors whitespace-nowrap"
              >
                {t("home.galleryCta")}
              </Link>
            </div>
          </Reveal>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {galleryPreview.map((img, i) => (
              <Reveal key={img.id} delayMs={(i % 4) * 80}>
                <div className="group overflow-hidden rounded-2xl">
                  {/* eslint-disable-next-line @next/next/no-img-element -- admin-managed external URLs, not local static assets */}
                  <img
                    src={img.url}
                    alt={img.caption || "Dar Al Hay event"}
                    className="w-full h-40 object-cover transition-transform duration-500 ease-out group-hover:scale-105"
                  />
                </div>
              </Reveal>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
