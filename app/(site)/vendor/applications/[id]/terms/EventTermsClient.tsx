"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale } from "@/lib/i18n/context";
import { LuxeCheckbox } from "@/components/ui/LuxeCheckbox";
import { sanitizeAgreementHtml } from "@/lib/sanitizeHtml";
import { PhoneVerifyModal } from "@/components/vendor/PhoneVerifyModal";
import { formatAed } from "@/lib/constants";
import { FloorPlan } from "@/components/floorplan/FloorPlan";
import { Legend } from "@/components/floorplan/Legend";
import type { FloorFeature, FloorBooth } from "@/components/floorplan/types";
import { getFloorplanViewBox, worldRectOf } from "@/lib/floorplan/transform";

interface BookingSummary {
  lines: { code: string; priceAedFils: number | null; baseAedFils: number | null; vatAedFils: number | null }[];
  subtotalAedFils: number;
  vatAedFils: number;
  totalAedFils: number;
}

export function EventTermsClient({
  applicationId,
  eventId,
  eventName,
  eventDate,
  venue,
  businessName,
  boothCode,
  bookingSummary,
  title,
  version,
  bodyHtml,
}: {
  applicationId: string;
  eventId: string;
  eventName: string;
  eventDate: string;
  venue: string;
  businessName: string;
  boothCode: string | null;
  bookingSummary: BookingSummary;
  title: string;
  version: number;
  bodyHtml: string;
}) {
  const { locale } = useLocale();
  const router = useRouter();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [readProgress, setReadProgress] = useState(0);
  const [agreed, setAgreed] = useState(false);
  const [representativeName, setRepresentativeName] = useState("");
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accepted, setAccepted] = useState<{ representativeName: string; acceptedAt: string } | null>(null);
  const [continuing, setContinuing] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [mapData, setMapData] = useState<{
    features: FloorFeature[];
    booths: FloorBooth[];
    floorPlanImageUrl: string | null;
    tiers: { sizeKey: string; label: string; priceAedFils: number }[];
    venueScaleConfirmed: boolean;
    venueWidthMm: number | null;
    venueDepthMm: number | null;
    venueBackgroundNaturalWidthPx: number | null;
    venueBackgroundNaturalHeightPx: number | null;
    venueBackgroundOffsetXMm: number | null;
    venueBackgroundOffsetYMm: number | null;
    venueBackgroundScale: number | null;
    venueBackgroundRotationDeg: number;
    venueShape: string | null;
    venueBoundaryJson: string | null;
  } | null>(null);
  const [mapLoading, setMapLoading] = useState(false);

  async function toggleMap() {
    if (mapOpen) {
      setMapOpen(false);
      return;
    }
    setMapOpen(true);
    if (mapData) return;
    setMapLoading(true);
    try {
      const res = await fetch(`/api/events/${eventId}/floorplan?applicationId=${applicationId}`);
      if (res.ok) setMapData(await res.json());
    } finally {
      setMapLoading(false);
    }
  }

  const scrolledToBottom = readProgress >= 100;

  const SIZE_PALETTE = ["#C97C4B", "#8A5A38", "#D9A066", "#6B4429"];
  const mapSizeStyles: Record<string, { color: string; label: string }> = {};
  (mapData?.tiers || []).forEach((t, i) => {
    mapSizeStyles[t.sizeKey] = { color: SIZE_PALETTE[i % SIZE_PALETTE.length], label: t.label };
  });

  // Real mm rendering for this map preview (see lib/floorplan/transform.ts)
  // — same derived-state pattern as every other vendor-facing floor plan
  // (ApplicationDetailClient, BoothSelector, Booking Review): normalize
  // gridX/Y/W/H into current-viewbox-units via useMemo, never mutating the
  // canonical mapData.booths/features. Previously this map stayed on the
  // legacy 0-100 percentage square regardless of confirmed scale.
  const mapViewBox = getFloorplanViewBox({
    venueScaleConfirmed: mapData?.venueScaleConfirmed ?? false,
    venueWidthMm: mapData?.venueWidthMm ?? null,
    venueDepthMm: mapData?.venueDepthMm ?? null,
  });
  const mapCoordinateMode = mapViewBox.mode;
  const mapVenueSize = { venueWidthMm: mapData?.venueWidthMm ?? 0, venueDepthMm: mapData?.venueDepthMm ?? 0 };
  const mapBackgroundAlignment = {
    naturalWidthPx: mapData?.venueBackgroundNaturalWidthPx ?? null,
    naturalHeightPx: mapData?.venueBackgroundNaturalHeightPx ?? null,
    offsetXMm: mapData?.venueBackgroundOffsetXMm ?? null,
    offsetYMm: mapData?.venueBackgroundOffsetYMm ?? null,
    scale: mapData?.venueBackgroundScale ?? null,
    rotationDeg: mapData?.venueBackgroundRotationDeg ?? 0,
  };
  const mapDisplayBooths = useMemo(
    () => (mapData?.booths ?? []).map((b) => ({ ...b, ...(() => { const r = worldRectOf(b, mapCoordinateMode, mapVenueSize); return { gridX: r.x, gridY: r.y, gridW: r.w, gridH: r.h }; })() })),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mapVenueSize is a fresh object literal every render; depending on its primitive fields (already listed) is equivalent and avoids invalidating this memo every render
    [mapData?.booths, mapCoordinateMode, mapVenueSize.venueWidthMm, mapVenueSize.venueDepthMm]
  );
  const mapDisplayFeatures = useMemo(
    () => (mapData?.features ?? []).map((f) => ({ ...f, ...(() => { const r = worldRectOf(f, mapCoordinateMode, mapVenueSize); return { gridX: r.x, gridY: r.y, gridW: r.w, gridH: r.h }; })() })),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mapVenueSize is a fresh object literal every render; depending on its primitive fields (already listed) is equivalent and avoids invalidating this memo every render
    [mapData?.features, mapCoordinateMode, mapVenueSize.venueWidthMm, mapVenueSize.venueDepthMm]
  );

  function measureScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const scrollable = el.scrollHeight - el.clientHeight;
    const pct = scrollable <= 0 ? 100 : Math.min(100, Math.round((el.scrollTop / scrollable) * 100));
    setReadProgress((prev) => Math.max(prev, pct));
  }

  useEffect(() => {
    // Short content that never needs scrolling shouldn't trap the vendor —
    // check once on mount whether there's anything to scroll through at all.
    measureScroll();
  }, []);

  const canAccept = scrolledToBottom && agreed && representativeName.trim().length >= 2;

  const dateFmt = (iso: string) =>
    new Date(iso).toLocaleDateString(locale === "ar" ? "ar-AE" : "en-AE", { day: "numeric", month: "long", year: "numeric" });

  function formatAcceptedAt(iso: string) {
    const d = new Date(iso);
    const date = d.toLocaleDateString(locale === "ar" ? "ar-AE" : "en-AE", { day: "numeric", month: "long", year: "numeric" });
    const time = d.toLocaleTimeString(locale === "ar" ? "ar-AE" : "en-AE", { hour: "numeric", minute: "2-digit" });
    return `${date} · ${time}`;
  }

  async function accept() {
    if (!canAccept) return;
    setAccepting(true);
    setError(null);
    try {
      const res = await fetch(`/api/applications/${applicationId}/event-terms`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ representativeName: representativeName.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.code === "VERIFICATION_REQUIRED") {
          setVerifying(true);
          return;
        }
        throw new Error(data.error || "Could not record your acceptance");
      }
      setAccepted({ representativeName: data.representativeName ?? representativeName.trim(), acceptedAt: data.acceptedAt ?? new Date().toISOString() });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setAccepting(false);
    }
  }

  async function continueToPayment() {
    setContinuing(true);
    setError(null);
    try {
      const res = await fetch(`/api/checkout/${applicationId}/start`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Could not continue to payment");
      }
      router.push(`/vendor/applications/${applicationId}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setContinuing(false);
    }
  }

  return (
    <div className="container-page py-14 md:py-16 max-w-3xl">
      <Link href={`/vendor/applications/${applicationId}`} className="text-sm text-brown-light hover:text-brown-dark transition-colors">
        &larr; {locale === "ar" ? "العودة إلى الطلب" : "Back to application"}
      </Link>

      {/* Document header — framed like the opening of an official DAH contract */}
      <div className="mt-6 mb-10 text-center">
        <p className="label-caps mb-3">{locale === "ar" ? "فعاليات دار الحي" : "Dar Al Hay Events"}</p>
        <h1 className="font-heading text-3xl md:text-4xl text-brown-dark">{eventName}</h1>
        <p className="text-brown-light mt-1">
          {title} <span className="text-brown-light/70">· {locale === "ar" ? `الإصدار ${version}` : `v${version}`}</span>
        </p>
      </div>

      <dl className="grid grid-cols-2 sm:grid-cols-4 gap-px rounded-xl border border-brown/12 bg-brown/12 overflow-hidden mb-6 text-center">
        <MetaCell label={locale === "ar" ? "تاريخ الفعالية" : "Event date"} value={dateFmt(eventDate)} />
        <MetaCell label={locale === "ar" ? "الموقع" : "Venue"} value={venue} />
        <MetaCell label={locale === "ar" ? "اسم النشاط" : "Business"} value={businessName} />
        <MetaCell label={locale === "ar" ? "الكشك" : "Booth"} value={boothCode ?? "—"} />
      </dl>

      {/* Persistent booking summary + read-only map access — kept visible
          throughout Terms review, per requirement: Event Terms shows a
          booking summary and [View Booth on Map] access, never just a bare
          booth code. */}
      {bookingSummary.lines.length > 0 && (
        <div className="mb-10 rounded-xl border border-brown/15 bg-cream-soft/70 p-5 md:p-6">
          <div className="flex items-center justify-between mb-3">
            <p className="label-caps">{locale === "ar" ? "ملخص الحجز" : "Booking Summary"}</p>
            <button type="button" onClick={toggleMap} className="text-xs underline text-brown hover:text-brown-dark">
              {mapOpen ? (locale === "ar" ? "إخفاء الخريطة" : "Hide Map") : locale === "ar" ? "عرض الكشك على الخريطة" : "View Booth on Map"}
            </button>
          </div>
          <div className="space-y-1.5 text-sm">
            {bookingSummary.lines.map((l) => (
              <div key={l.code} className="flex items-center justify-between">
                <span className="text-brown-dark font-medium">{l.code}</span>
                <span className="text-brown-dark">{l.priceAedFils != null ? formatAed(l.priceAedFils) : "—"}</span>
              </div>
            ))}
          </div>
          {bookingSummary.lines.length > 1 && (
            <div className="space-y-1 mt-3 pt-3 border-t border-brown/10 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-brown-light">{locale === "ar" ? "المجموع الفرعي" : "Subtotal"}</span>
                <span className="text-brown-dark">{formatAed(bookingSummary.subtotalAedFils)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-brown-light">{locale === "ar" ? "ضريبة القيمة المضافة" : "VAT"}</span>
                <span className="text-brown-dark">{formatAed(bookingSummary.vatAedFils)}</span>
              </div>
            </div>
          )}
          <div className="flex items-center justify-between mt-2 pt-2 border-t border-brown/10">
            <span className="text-brown-dark font-medium">{locale === "ar" ? "الإجمالي" : "Total"}</span>
            <span className="text-brown-dark font-semibold">{formatAed(bookingSummary.totalAedFils)}</span>
          </div>

          {mapOpen && (
            <div className="mt-5">
              {mapLoading ? (
                <p className="text-sm text-brown-light">{locale === "ar" ? "جارٍ التحميل…" : "Loading…"}</p>
              ) : mapData ? (
                <>
                  <FloorPlan
                    features={mapDisplayFeatures}
                    booths={mapDisplayBooths}
                    sizeStyles={mapSizeStyles}
                    backgroundImageUrl={mapData.floorPlanImageUrl}
                    interactive
                    focusBoothId={mapData.booths.find((b) => b.isMine)?.id ?? null}
                    focusNonce={1}
                    viewBox={mapViewBox}
                    coordinateMode={mapCoordinateMode}
                    backgroundAlignment={mapBackgroundAlignment}
                    venueShape={mapData.venueShape}
                    venueBoundaryJson={mapData.venueBoundaryJson}
                  />
                  <Legend sizeStyles={mapSizeStyles} showMineKey />
                </>
              ) : (
                <p className="text-sm text-red-700">{locale === "ar" ? "تعذر تحميل الخريطة" : "Could not load the map"}</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* The agreement document itself */}
      <div
        ref={scrollRef}
        onScroll={measureScroll}
        className="max-h-[56vh] overflow-y-auto rounded-2xl border border-brown/15 bg-cream shadow-sm px-6 py-8 md:px-12 md:py-10 prose prose-headings:font-heading prose-headings:text-brown-dark max-w-none"
      >
        <div className="mx-auto max-w-[62ch]" dangerouslySetInnerHTML={{ __html: sanitizeAgreementHtml(bodyHtml) }} />
      </div>

      <div className="mt-3 flex items-center gap-3">
        <div className="h-1 flex-1 rounded-full bg-brown/10 overflow-hidden">
          <div
            className="h-full rounded-full bg-brown transition-[width] duration-300 ease-out"
            style={{ width: `${readProgress}%` }}
          />
        </div>
        <span className="text-xs text-brown-light shrink-0 tabular-nums">
          {scrolledToBottom
            ? locale === "ar"
              ? "تمت مراجعة الاتفاقية"
              : "Agreement reviewed"
            : locale === "ar"
            ? `تمت المراجعة ${readProgress}%`
            : `Agreement reviewed ${readProgress}%`}
        </span>
      </div>

      {/* Acceptance section — disabled until fully read, then eases in */}
      <div className="mt-10 rounded-2xl border border-brown/15 bg-cream-soft/70 p-6 md:p-8">
        <p className="label-caps mb-1">{locale === "ar" ? "قبول الاتفاقية" : "Agreement Acceptance"}</p>

        {accepted ? (
          <div className="mt-5">
            <div className="flex items-center gap-2.5 text-brown-dark">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                <circle cx="12" cy="12" r="10" />
                <path d="m8 12 3 3 5-6" />
              </svg>
              <p className="font-heading text-lg">{locale === "ar" ? "تم قبول الاتفاقية" : "Agreement Accepted"}</p>
            </div>
            <p className="text-sm text-brown-light mt-2 ms-[30px]">
              {locale === "ar" ? "تم القبول من قبل" : "Accepted by"} {accepted.representativeName}
              <br />
              {formatAcceptedAt(accepted.acceptedAt)}
            </p>

            {error && <p className="text-sm text-red-700 mt-4">{error}</p>}

            <button
              onClick={continueToPayment}
              disabled={continuing}
              className="mt-6 px-7 py-3 rounded-full bg-brown text-cream-soft text-sm tracking-wide hover:bg-brown-dark transition-colors disabled:opacity-40"
            >
              {continuing ? "…" : locale === "ar" ? "المتابعة للدفع" : "Continue to Payment"}
            </button>
          </div>
        ) : (
          <>
            {!scrolledToBottom ? (
              <p className="text-sm text-brown-light mt-2 mb-5">
                {locale === "ar" ? "يرجى مراجعة الاتفاقية كاملة للمتابعة" : "Please review the full agreement to continue"}
              </p>
            ) : (
              <div className="h-1" />
            )}

            <div className={`space-y-5 transition-opacity duration-500 ease-out ${scrolledToBottom ? "opacity-100" : "opacity-50"}`}>
              <label className="flex flex-col gap-1 text-sm max-w-sm">
                {locale === "ar" ? "اسم الممثل المفوض" : "Authorized Representative"}
                <input
                  value={representativeName}
                  onChange={(e) => setRepresentativeName(e.target.value)}
                  disabled={!scrolledToBottom}
                  placeholder={locale === "ar" ? "الاسم الكامل" : "Full name"}
                  className="border border-brown/20 rounded-lg px-3 py-2.5 bg-cream-soft disabled:cursor-not-allowed"
                />
              </label>

              <label className={`flex items-start gap-3 ${scrolledToBottom ? "cursor-pointer" : "cursor-not-allowed"}`}>
                <LuxeCheckbox checked={agreed} onChange={setAgreed} disabled={!scrolledToBottom} className="mt-0.5" />
                <span className="text-sm text-ink font-medium leading-relaxed">
                  {locale === "ar"
                    ? `أؤكد أنني قرأت وأوافق على الشروط والأحكام الخاصة بفعالية ${eventName}.`
                    : `I confirm that I have read and agree to the Terms & Conditions for ${eventName}.`}
                </span>
              </label>

              {error && <p className="text-sm text-red-700">{error}</p>}

              <button
                onClick={accept}
                disabled={!canAccept || accepting}
                className={`px-7 py-3 rounded-full text-sm tracking-wide transition-colors ${
                  canAccept
                    ? "bg-brown text-cream-soft hover:bg-brown-dark"
                    : "bg-transparent border border-brown/20 text-brown-light cursor-not-allowed"
                } disabled:opacity-60`}
              >
                {accepting ? "…" : locale === "ar" ? "الموافقة والمتابعة للدفع" : "Accept & Continue to Payment"}
              </button>
            </div>
          </>
        )}
      </div>

      {verifying && (
        <PhoneVerifyModal
          onClose={() => setVerifying(false)}
          onVerified={() => {
            setVerifying(false);
            accept();
          }}
        />
      )}
    </div>
  );
}

function MetaCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-cream-soft px-3 py-4">
      <p className="text-[11px] uppercase tracking-widest text-brown-light mb-1">{label}</p>
      <p className="text-sm text-brown-dark font-medium truncate">{value}</p>
    </div>
  );
}
