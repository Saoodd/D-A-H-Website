"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale } from "@/lib/i18n/context";
import { Countdown } from "@/components/Countdown";
import { Button } from "@/components/ui/Button";
import { formatAed } from "@/lib/constants";
import { checkMultiBoothFit, isProvablyAdjacent } from "@/lib/boothFit";
import { PaymentArrangedNotice } from "@/components/vendor/PaymentArrangedNotice";
import { PhoneVerifyModal } from "@/components/vendor/PhoneVerifyModal";
import { FloorPlan } from "@/components/floorplan/FloorPlan";
import { Legend } from "@/components/floorplan/Legend";
import { getFloorplanViewBox, worldRectOf } from "@/lib/floorplan/transform";
import { DAH_SIZE_PALETTE } from "@/lib/theme/brand";
import { SkeletonFloorPlan } from "@/components/ui/Skeleton";
import type { FloorFeature, FloorBooth } from "@/components/floorplan/types";

interface BookingSummaryLine {
  code: string;
  priceAedFils: number | null;
  baseAedFils: number | null;
  vatAedFils: number | null;
  widthMm: number | null;
  depthMm: number | null;
  size: string;
}

interface BookingSummary {
  lines: BookingSummaryLine[];
  subtotalAedFils: number;
  vatAedFils: number;
  totalAedFils: number;
}

interface FloorplanData {
  features: FloorFeature[];
  booths: FloorBooth[];
  tiers: { sizeKey: string; label: string; priceAedFils: number; vatInclusive: boolean }[];
  floorPlanImageUrl: string | null;
  venueScaleConfirmed: boolean;
  venueWidthMm: number | null;
  venueDepthMm: number | null;
  venueBackgroundNaturalWidthPx: number | null;
  venueBackgroundNaturalHeightPx: number | null;
  venueBackgroundOffsetXMm: number | null;
  venueBackgroundOffsetYMm: number | null;
  venueBackgroundScale: number | null;
  venueBackgroundRotationDeg: number;
  venueShape?: string | null;
  venueBoundaryJson?: string | null;
}

const SIZE_PALETTE = DAH_SIZE_PALETTE;

// The dedicated pre-Terms review moment: everything the vendor is about to
// commit to (booth(s), price, whether their declared setup actually fits,
// and where it sits on the venue map) in one place, before they move on to
// accepting Event Terms (or straight to payment when no Terms are
// published). Nothing here mutates the hold — "Confirm & Continue" is the
// only action, and it only ever routes forward or starts checkout, exactly
// like the flows it replaces inline on the main application page.
export function BookingReviewClient({
  applicationId,
  eventId,
  eventName,
  eventDate,
  venue,
  businessName,
  acceptanceExpiresAt,
  setupWidthMm,
  setupDepthMm,
  eventTermsRequired,
  eventTermsAccepted,
  bookingSummary,
  onlinePaymentAvailable,
}: {
  applicationId: string;
  eventId: string;
  eventName: string;
  eventDate: string;
  venue: string;
  businessName: string;
  acceptanceExpiresAt: string | null;
  setupWidthMm: number | null;
  setupDepthMm: number | null;
  eventTermsRequired: boolean;
  eventTermsAccepted: boolean;
  bookingSummary: BookingSummary;
  onlinePaymentAvailable: boolean;
}) {
  const { locale } = useLocale();
  const isAr = locale === "ar";
  const router = useRouter();

  const [floorplan, setFloorplan] = useState<FloorplanData | null>(null);
  const [continuing, setContinuing] = useState(false);
  const [changing, setChanging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  // Also flips on if the server refuses checkout (ONLINE_PAYMENT_UNAVAILABLE)
  // after this page was rendered with online payment available.
  const [paymentUnavailable, setPaymentUnavailable] = useState(!onlinePaymentAvailable);
  const termsDone = !eventTermsRequired || eventTermsAccepted;

  const loadFloorplan = useCallback(async () => {
    const res = await fetch(`/api/events/${eventId}/floorplan?applicationId=${applicationId}`);
    if (res.ok) setFloorplan(await res.json());
  }, [applicationId, eventId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch the floor plan once on mount
    loadFloorplan();
  }, [loadFloorplan]);

  const viewBox = getFloorplanViewBox({
    venueScaleConfirmed: floorplan?.venueScaleConfirmed ?? false,
    venueWidthMm: floorplan?.venueWidthMm ?? null,
    venueDepthMm: floorplan?.venueDepthMm ?? null,
  });
  const coordinateMode = viewBox.mode;
  const venueSize = { venueWidthMm: floorplan?.venueWidthMm ?? 0, venueDepthMm: floorplan?.venueDepthMm ?? 0 };
  const backgroundAlignment = {
    naturalWidthPx: floorplan?.venueBackgroundNaturalWidthPx ?? null,
    naturalHeightPx: floorplan?.venueBackgroundNaturalHeightPx ?? null,
    offsetXMm: floorplan?.venueBackgroundOffsetXMm ?? null,
    offsetYMm: floorplan?.venueBackgroundOffsetYMm ?? null,
    scale: floorplan?.venueBackgroundScale ?? null,
    rotationDeg: floorplan?.venueBackgroundRotationDeg ?? 0,
  };
  const displayBooths = useMemo(
    () => (floorplan?.booths ?? []).map((b) => ({ ...b, ...(() => { const r = worldRectOf(b, coordinateMode, venueSize); return { gridX: r.x, gridY: r.y, gridW: r.w, gridH: r.h }; })() })),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- venueSize is a fresh object literal every render; depending on its primitive fields (already listed) is equivalent and avoids invalidating this memo every render
    [floorplan?.booths, coordinateMode, venueSize.venueWidthMm, venueSize.venueDepthMm]
  );
  const displayFeatures = useMemo(
    () => (floorplan?.features ?? []).map((f) => ({ ...f, ...(() => { const r = worldRectOf(f, coordinateMode, venueSize); return { gridX: r.x, gridY: r.y, gridW: r.w, gridH: r.h }; })() })),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- venueSize is a fresh object literal every render; depending on its primitive fields (already listed) is equivalent and avoids invalidating this memo every render
    [floorplan?.features, coordinateMode, venueSize.venueWidthMm, venueSize.venueDepthMm]
  );

  const sizeStyles: Record<string, { color: string; label: string }> = {};
  (floorplan?.tiers || []).forEach((tr, i) => {
    sizeStyles[tr.sizeKey] = { color: SIZE_PALETTE[i % SIZE_PALETTE.length], label: tr.label };
  });

  const hasSetup = setupWidthMm != null && setupDepthMm != null;
  const fitCheck = hasSetup
    ? checkMultiBoothFit({ widthMm: setupWidthMm, depthMm: setupDepthMm }, bookingSummary.lines.map((l) => ({ widthMm: l.widthMm, depthMm: l.depthMm })))
    : null;
  let setupFitNotice: { tone: "good" | "caution"; text: string } | null = null;
  if (hasSetup && fitCheck) {
    if (fitCheck.anyFits) {
      setupFitNotice = { tone: "good", text: isAr ? "مساحة إعدادك تتسع ضمن الحجز المختار." : "Your setup fits within your selected booking." };
    } else if (fitCheck.needsCombinedSpaceCaution) {
      const boothPositions = floorplan?.booths ?? [];
      const anyAdjacentPair =
        bookingSummary.lines.length > 1 &&
        bookingSummary.lines.some((a, i) =>
          bookingSummary.lines.slice(i + 1).some((b) => {
            const ba = boothPositions.find((x) => x.code === a.code);
            const bb = boothPositions.find((x) => x.code === b.code);
            return ba && bb && isProvablyAdjacent(ba, bb);
          })
        );
      setupFitNotice = {
        tone: "caution",
        text:
          bookingSummary.lines.length > 1
            ? anyAdjacentPair
              ? isAr
                ? "هذه الأكشاك متجاورة، لكن يجب تأكيد ملاءمة إعدادك للمساحة المجمعة مع دار الحي مباشرة."
                : "These booths are adjacent, but please confirm your setup fits the combined space directly with DAH."
              : isAr
              ? "يُرجى تأكيد ملاءمة إعدادك مع دار الحي مباشرة — لا يمكننا تأكيد أن هذه الأكشاك تشكل مساحة واحدة متصلة."
              : "Please confirm your setup fits with DAH directly — we can't confirm these booths form one connected space."
            : isAr
            ? "مساحة إعدادك أكبر من هذا الكشك. يرجى التواصل مع دار الحي قبل المتابعة."
            : "Your setup is larger than this booth. Please contact DAH before continuing.",
      };
    }
  }

  async function confirmAndContinue() {
    setContinuing(true);
    setError(null);
    try {
      if (eventTermsRequired && !eventTermsAccepted) {
        router.push(`/vendor/applications/${applicationId}/terms`);
        return;
      }
      const res = await fetch(`/api/checkout/${applicationId}/start`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data.code === "VERIFICATION_REQUIRED") {
          setVerifying(true);
          return;
        }
        if (data.code === "ONLINE_PAYMENT_UNAVAILABLE") {
          setPaymentUnavailable(true);
          return;
        }
        throw new Error(data.error || "Could not continue to payment");
      }
      const started = await res.json().catch(() => ({}));
      // Redirect-style providers: go to their payment page. The sandbox
      // returns no URL and pays from the booking page instead.
      if (started.redirectUrl) {
        window.location.assign(started.redirectUrl);
        return;
      }
      router.push(`/vendor/applications/${applicationId}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setContinuing(false);
    }
  }

  async function chooseDifferentBooths() {
    setChanging(true);
    setError(null);
    try {
      await Promise.all(
        bookingSummary.lines.map((l) => {
          const booth = floorplan?.booths.find((b) => b.code === l.code);
          if (!booth) return Promise.resolve();
          return fetch(`/api/booths/${booth.id}/release`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ applicationId }),
          });
        })
      );
      router.push(`/vendor/applications/${applicationId}`);
      router.refresh();
    } catch {
      setError(isAr ? "حدث خطأ ما" : "Something went wrong");
      setChanging(false);
    }
  }

  const dateFmt = (iso: string) =>
    new Date(iso).toLocaleDateString(isAr ? "ar-AE" : "en-AE", { day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="container-page py-14 md:py-16 max-w-3xl">
      <Link href={`/vendor/applications/${applicationId}`} className="text-sm text-brown-light hover:text-brown-dark transition-colors">
        &larr; {isAr ? "العودة إلى الطلب" : "Back to application"}
      </Link>

      <div className="mt-6 mb-8 text-center">
        <p className="label-caps mb-3">{isAr ? "مراجعة الحجز" : "Booking Review"}</p>
        <h1 className="font-heading text-3xl md:text-4xl text-brown-dark">{eventName}</h1>
        <p className="text-brown-light mt-1">
          {isAr ? "راجع تفاصيل حجزك قبل المتابعة" : "Review your booking details before you continue"}
        </p>
      </div>

      {acceptanceExpiresAt && (
        <div className="mb-6 rounded-xl bg-cream border border-brown/10 px-5 py-4 flex items-center justify-between flex-wrap gap-2">
          <span className="text-sm text-brown-light">{isAr ? "المهلة" : "Deadline"}</span>
          <Countdown target={acceptanceExpiresAt} variant="hm" className="text-sm text-brown-dark" />
        </div>
      )}

      <dl className="grid grid-cols-2 sm:grid-cols-3 gap-px rounded-xl border border-brown/12 bg-brown/12 overflow-hidden mb-8 text-center">
        <MetaCell label={isAr ? "تاريخ الفعالية" : "Event date"} value={dateFmt(eventDate)} />
        <MetaCell label={isAr ? "الموقع" : "Venue"} value={venue} />
        <MetaCell label={isAr ? "اسم النشاط" : "Business"} value={businessName} />
      </dl>

      <div className="mb-6 rounded-xl border border-brown/15 bg-cream-soft/70 p-5 md:p-6">
        <p className="label-caps mb-3">
          {bookingSummary.lines.length > 1 ? (isAr ? "أكشاكك المختارة" : "Your Selected Booths") : isAr ? "كشكك المختار" : "Your Selected Booth"}
        </p>
        <div className="space-y-3">
          {bookingSummary.lines.map((l) => (
            <div key={l.code} className="flex items-center justify-between gap-3 text-sm border-b border-brown/10 last:border-b-0 pb-3 last:pb-0">
              <div>
                <span className="font-heading text-xl text-brown-dark">{l.code}</span>
                {l.widthMm != null && l.depthMm != null && (
                  <span className="text-xs text-brown-light ml-2">
                    {(l.widthMm / 1000).toLocaleString()} × {(l.depthMm / 1000).toLocaleString()} m
                  </span>
                )}
              </div>
              <span className="text-brown-dark font-medium">{l.priceAedFils != null ? formatAed(l.priceAedFils) : "—"}</span>
            </div>
          ))}
        </div>

        <div className="space-y-1 mt-4 pt-3 border-t border-brown/10 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-brown-light">{isAr ? "المجموع الفرعي" : "Subtotal"}</span>
            <span className="text-brown-dark">{formatAed(bookingSummary.subtotalAedFils)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-brown-light">{isAr ? "ضريبة القيمة المضافة" : "VAT"}</span>
            <span className="text-brown-dark">{formatAed(bookingSummary.vatAedFils)}</span>
          </div>
          <div className="flex items-center justify-between pt-1.5 mt-1.5 border-t border-brown/10">
            <span className="text-brown-dark font-medium">{isAr ? "الإجمالي" : "Total"}</span>
            <span className="text-brown-dark font-semibold text-base">{formatAed(bookingSummary.totalAedFils)}</span>
          </div>
        </div>

        {hasSetup && (
          <div className="mt-4 pt-4 border-t border-brown/10 text-xs">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-brown-light uppercase tracking-wide">{isAr ? "مساحتك" : "Your Setup"}</span>
              <span className="text-brown-dark font-medium">
                {(setupWidthMm! / 1000).toLocaleString()} × {(setupDepthMm! / 1000).toLocaleString()} m
              </span>
            </div>
            {setupFitNotice && (
              <p className={`mt-1.5 font-medium ${setupFitNotice.tone === "good" ? "text-emerald-700" : "text-amber-800"}`}>{setupFitNotice.text}</p>
            )}
          </div>
        )}
      </div>

      <div className="mb-8 rounded-xl border border-brown/15 bg-cream-soft/70 p-5 md:p-6">
        <p className="label-caps mb-4">{isAr ? "موقع الحجز على المخطط" : "Your Booking on the Floor Plan"}</p>
        {floorplan ? (
          <>
            <FloorPlan
              features={displayFeatures}
              booths={displayBooths}
              sizeStyles={sizeStyles}
              backgroundImageUrl={floorplan.floorPlanImageUrl}
              interactive
              focusBoothId={floorplan.booths.find((b) => b.isMine)?.id ?? null}
              focusBoothIds={floorplan.booths.filter((b) => b.isMine).map((b) => b.id)}
              focusNonce={1}
              viewBox={viewBox}
              coordinateMode={coordinateMode}
              backgroundAlignment={backgroundAlignment}
              venueShape={floorplan.venueShape}
              venueBoundaryJson={floorplan.venueBoundaryJson}
            />
            <Legend sizeStyles={sizeStyles} showMineKey />
          </>
        ) : (
          <SkeletonFloorPlan />
        )}
      </div>

      {error && <p className="text-sm text-red-700 mb-4">{error}</p>}

      {paymentUnavailable && termsDone && (
        <div className="mb-6">
          <PaymentArrangedNotice acceptanceExpiresAt={acceptanceExpiresAt} />
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        {!(paymentUnavailable && termsDone) && (
        <Button onClick={confirmAndContinue} loading={continuing} disabled={changing} size="lg">
          {eventTermsRequired && !eventTermsAccepted
            ? isAr
              ? "المتابعة لمراجعة الشروط"
              : "Continue to Event Terms"
            : isAr
            ? "تأكيد والمتابعة للدفع"
            : "Confirm & Continue to Payment"}
        </Button>
        )}
        <Button onClick={chooseDifferentBooths} loading={changing} disabled={continuing} variant="secondary" size="lg">
          {bookingSummary.lines.length > 1 ? (isAr ? "اختيار أكشاك أخرى" : "Choose Different Booths") : isAr ? "اختيار كشك آخر" : "Choose a Different Booth"}
        </Button>
      </div>

      {verifying && (
        <PhoneVerifyModal
          onClose={() => setVerifying(false)}
          onVerified={() => {
            setVerifying(false);
            confirmAndContinue();
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
