"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/lib/i18n/context";
import { formatAed } from "@/lib/constants";
import { Reveal } from "@/components/Reveal";
import { LinkButton, Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/StatusBadge";

interface EventDetail {
  id: string;
  slug: string;
  name: string;
  description: string;
  location: string;
  startDate: string;
  endDate: string | null;
  coverImage: string | null;
  categories: string[];
  minPriceAedFils: number | null;
}

interface VendorState {
  authState: "logged_out" | "unverified" | "verified";
  application: {
    id: string;
    displayStatus: string;
    holdStage: string | null;
    eventTermsRequired: boolean;
    eventTermsAccepted: boolean;
  } | null;
}

/** One of the platform's distinct logged-in event CTA states — each has its
 *  own exact copy and destination, never a generic "View your application"
 *  once a vendor has moved past simply applying. */
function resolveApplicationCta(app: NonNullable<VendorState["application"]>, locale: "en" | "ar") {
  if (app.displayStatus === "PAID") {
    return { label: locale === "ar" ? "عرض الحجز" : "View Booking", href: `/vendor/applications/${app.id}` };
  }
  if (app.displayStatus === "ACCEPTED_UNPAID") {
    if (!app.holdStage) {
      return { label: locale === "ar" ? "اختيار الكشك" : "Select Booth", href: `/vendor/applications/${app.id}` };
    }
    if (app.holdStage === "REVIEW") {
      if (app.eventTermsRequired && !app.eventTermsAccepted) {
        return {
          label: locale === "ar" ? "مراجعة وقبول شروط الفعالية" : "Review & Accept Event Terms",
          href: `/vendor/applications/${app.id}/terms`,
        };
      }
      return { label: locale === "ar" ? "مراجعة الحجز" : "Review Booking", href: `/vendor/applications/${app.id}` };
    }
    // holdStage === "PAYMENT"
    return { label: locale === "ar" ? "المتابعة للدفع" : "Continue to Payment", href: `/vendor/applications/${app.id}` };
  }
  return null; // PENDING / REJECTED / EXPIRED fall back to the generic "View your application" below
}

const statusTone: Record<string, "neutral" | "positive" | "attention" | "negative"> = {
  PENDING: "neutral",
  REJECTED: "negative",
  ACCEPTED_UNPAID: "attention",
  PAID: "positive",
  EXPIRED: "neutral",
};

export function EventDetailClient({ event, vendorState }: { event: EventDetail; vendorState: VendorState }) {
  const { t, locale } = useLocale();
  const router = useRouter();
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dateFmt = (iso: string) =>
    new Date(iso).toLocaleDateString(locale === "ar" ? "ar-AE" : "en-AE", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });

  async function applyNow() {
    setApplying(true);
    setError(null);
    try {
      const res = await fetch("/api/vendor/apply-event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId: event.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not apply");
      router.push(`/vendor/applications/${data.applicationId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not apply");
      setApplying(false);
    }
  }

  return (
    <div>
      <div
        className={`h-56 md:h-80 bg-cover bg-center ${
          event.coverImage
            ? ""
            : "bg-cream-deep bg-[repeating-linear-gradient(45deg,rgba(107,68,41,0.04),rgba(107,68,41,0.04)_10px,transparent_10px,transparent_20px)]"
        }`}
        style={event.coverImage ? { backgroundImage: `url(${event.coverImage})` } : undefined}
      />
      <Reveal className="container-page py-14 max-w-3xl">
        <h1 className="font-heading text-3xl md:text-4xl text-brown-dark">{event.name}</h1>
        <p className="mt-3 text-brown-light">
          {dateFmt(event.startDate)}
          {event.endDate ? ` — ${dateFmt(event.endDate)}` : ""}
        </p>
        <p className="text-brown-light">{event.location}</p>

        {event.description && (
          <p className="mt-6 leading-relaxed text-ink whitespace-pre-line">{event.description}</p>
        )}

        {event.categories.length > 0 && (
          <div className="mt-6">
            <p className="text-xs uppercase tracking-widest text-brown-light mb-2">
              {locale === "ar" ? "الفئات" : "Vendor categories"}
            </p>
            <div className="flex flex-wrap gap-2">
              {event.categories.map((c) => (
                <span key={c} className="text-xs bg-cream-deep text-brown-dark rounded-full px-3 py-1">
                  {c}
                </span>
              ))}
            </div>
          </div>
        )}

        {event.minPriceAedFils != null && (
          <p className="mt-2 text-sm text-brown">
            {t("markets.from")} {formatAed(event.minPriceAedFils)}
          </p>
        )}

        <div className="mt-10">
          {vendorState.authState === "logged_out" && (
            <div>
              <p className="text-sm text-brown-light mb-4">{t("eventDetail.loginPrompt")}</p>
              <div className="flex flex-wrap gap-3">
                <LinkButton href={`/vendor/login?next=/events/${event.slug}`} size="lg">
                  {t("eventDetail.loginCta")}
                </LinkButton>
                <LinkButton href="/vendors" variant="secondary" size="lg">
                  {t("eventDetail.signupCta")}
                </LinkButton>
              </div>
            </div>
          )}

          {vendorState.authState === "unverified" && (
            <div className="rounded-[10px] border border-brown/10 bg-cream px-6 py-5 max-w-md">
              <p className="font-heading text-brown-dark">{t("eventDetail.unverifiedTitle")}</p>
              <p className="mt-2 text-sm text-brown-light">{t("eventDetail.unverifiedBody")}</p>
              <LinkButton href="/vendor/dashboard" variant="secondary" size="md" className="mt-4">
                {t("eventDetail.unverifiedCta")}
              </LinkButton>
            </div>
          )}

          {vendorState.authState === "verified" && !vendorState.application && (
            <div>
              {error && <p className="text-sm text-red-800 mb-3">{error}</p>}
              <Button size="lg" onClick={applyNow} loading={applying}>
                {applying ? t("eventDetail.applying") : t("eventDetail.applyCta")}
              </Button>
            </div>
          )}

          {vendorState.authState === "verified" && vendorState.application && (
            <div className="flex items-center gap-3 flex-wrap">
              <StatusBadge
                label={t(`vendor.status.${vendorState.application.displayStatus}`)}
                tone={statusTone[vendorState.application.displayStatus] ?? "neutral"}
              />
              {(() => {
                const cta = resolveApplicationCta(vendorState.application, locale);
                return (
                  <LinkButton href={cta ? cta.href : `/vendor/applications/${vendorState.application.id}`} variant="secondary" size="md">
                    {cta ? cta.label : t("eventDetail.viewApplicationCta")}
                  </LinkButton>
                );
              })()}
            </div>
          )}
        </div>
      </Reveal>
    </div>
  );
}
