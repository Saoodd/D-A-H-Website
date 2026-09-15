"use client";

import { formatAed, splitVatInclusiveTotal } from "@/lib/constants";
import { checkBoothFit } from "@/lib/boothFit";
import { Button } from "@/components/ui/Button";
import { useLocale } from "@/lib/i18n/context";
import type { FloorBooth } from "@/components/floorplan/types";

interface Tier {
  sizeKey: string;
  label: string;
  priceAedFils: number;
  vatInclusive: boolean;
}

/** "3x2" -> "3 × 2 m" / "300 × 200 cm", matching the label style used
 *  elsewhere for a booth's own sizeKey — used here for the vendor's
 *  declared setup, which is real mm data rather than a sizeKey string. */
function mmLabel(widthMm: number, depthMm: number): { m: string; cm: string } {
  return {
    m: `${(widthMm / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })} × ${(depthMm / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })} m`,
    cm: `${Math.round(widthMm / 10)} × ${Math.round(depthMm / 10)} cm`,
  };
}

// A booth click never starts the hold by itself — this modal is the only
// path from "clicked" to either "staged" (multi-booth selection, added to
// the parent's running list) or "held" (single-booth, or the final
// "Confirm Booth(s)" in multi mode) — see the `mode` prop. The server-side
// hold (POST /api/applications/[id]/booths/hold) is still the sole source
// of truth on availability AND on size-fit for a single booth; this only
// decides WHEN that request fires and gives the vendor an early,
// non-authoritative preview of both.
export function BoothConfirmModal({
  booth,
  tiers,
  eventName,
  busy,
  onConfirm,
  onCancel,
  setupWidthMm,
  setupDepthMm,
  onEditSetupSize,
  mode = "single",
}: {
  booth: FloorBooth;
  tiers: Tier[];
  eventName: string;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  setupWidthMm?: number | null;
  setupDepthMm?: number | null;
  onEditSetupSize?: () => void;
  /** "single": this booth is (or completes) the whole booking — confirming
   *  holds it immediately, same as before. "add": staging a booth as part
   *  of a multi-booth selection — confirming only adds it to the parent's
   *  running list, nothing is held yet. */
  mode?: "single" | "add";
}) {
  const { locale } = useLocale();
  const isAr = locale === "ar";
  const tier = tiers.find((t) => t.sizeKey === booth.size);
  const resolvedPrice = booth.priceAedFils ?? tier?.priceAedFils ?? null;
  const sizeLabel = tier?.label || booth.size;

  const hasSetup = setupWidthMm != null && setupDepthMm != null;
  const hasBoothDims = booth.widthMm != null && booth.depthMm != null;
  const fit =
    hasSetup && hasBoothDims
      ? checkBoothFit({ widthMm: setupWidthMm!, depthMm: setupDepthMm! }, { widthMm: booth.widthMm!, depthMm: booth.depthMm! })
      : { status: "UNKNOWN" as const };
  const blocked = fit.status === "DOES_NOT_FIT";

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink/40 px-0 sm:px-4" role="dialog" aria-modal="true" aria-label="Confirm booth">
      <div className="w-full sm:max-w-sm rounded-t-2xl sm:rounded-[10px] bg-cream border border-brown/10 p-6 sm:p-7">
        <p className="label-caps mb-1">{isAr ? "تأكيد الكشك" : "Confirm Booth"}</p>
        <h2 className="font-heading text-2xl text-brown-dark mb-5">
          {isAr ? `اختيار كشك ${booth.code}؟` : `Choose Booth ${booth.code}?`}
        </h2>

        {hasSetup && hasBoothDims && (
          <div className="mb-5 rounded-[8px] border border-brown/10 bg-cream-soft p-4">
            <div className="flex items-center justify-between gap-3 text-xs mb-1.5">
              <span className="text-brown-light uppercase tracking-wide">{isAr ? "مساحتك" : "Your Setup"}</span>
              <span className="text-brown-dark font-medium">{mmLabel(setupWidthMm!, setupDepthMm!).m}</span>
            </div>
            <div className="flex items-center justify-between gap-3 text-xs mb-3">
              <span className="text-brown-light uppercase tracking-wide">{isAr ? "مساحة الكشك" : "Slot Size"}</span>
              <span className="text-brown-dark font-medium">{mmLabel(booth.widthMm!, booth.depthMm!).m}</span>
            </div>
            <p className={`text-sm font-medium ${blocked ? "text-red-700" : "text-emerald-700"}`}>
              {blocked
                ? isAr
                  ? "لا تتسع مساحتك ضمن هذا الكشك."
                  : "Your setup does not fit within this booth size."
                : isAr
                ? "مساحتك تتسع ضمن هذا الكشك."
                : "Your setup fits within this booth size."}
            </p>
            {blocked && onEditSetupSize && (
              <button type="button" onClick={onEditSetupSize} className="mt-2 text-xs underline text-brown">
                {isAr ? "تعديل مساحة الإعداد" : "Edit Setup Size"}
              </button>
            )}
          </div>
        )}

        <div className="space-y-3 mb-6 text-sm">
          <Row label={isAr ? "رمز الكشك" : "Booth code"} value={booth.code} />
          <Row label={isAr ? "المساحة" : "Size"} value={sizeLabel} />

          {resolvedPrice != null && tier?.vatInclusive ? (
            <>
              <Row label={isAr ? "سعر الكشك" : "Booth Price"} value={formatAed(splitVatInclusiveTotal(resolvedPrice).baseAedFils)} />
              <Row label={isAr ? "ضريبة القيمة المضافة" : "VAT"} value={formatAed(splitVatInclusiveTotal(resolvedPrice).vatAedFils)} />
              <div className="flex items-center justify-between gap-3 pt-2 border-t border-brown/10">
                <span className="text-brown-dark font-medium">{isAr ? "الإجمالي" : "Total"}</span>
                <span className="text-brown-dark font-semibold text-base">{formatAed(resolvedPrice)}</span>
              </div>
            </>
          ) : (
            <Row
              label={isAr ? "السعر" : "Price"}
              value={resolvedPrice != null ? formatAed(resolvedPrice) : isAr ? "سيتم التأكيد" : "To be confirmed"}
            />
          )}

          <Row label={isAr ? "الفعالية" : "Event"} value={eventName} />
        </div>

        <div className="flex flex-col gap-3">
          <Button onClick={onConfirm} loading={busy} disabled={blocked} size="lg" className="w-full">
            {mode === "add" ? (isAr ? "إضافة هذا الكشك" : "Add This Booth") : isAr ? "تأكيد الكشك" : "Confirm Booth"}
          </Button>
          <Button onClick={onCancel} disabled={busy} variant="secondary" size="lg" className="w-full">
            {isAr ? "اختيار كشك آخر" : "Choose Another Booth"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-brown-light">{label}</span>
      <span className="text-brown-dark font-medium text-right">{value}</span>
    </div>
  );
}
