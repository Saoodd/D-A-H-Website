"use client";

import { formatAed, splitVatInclusiveTotal } from "@/lib/constants";
import { Button } from "@/components/ui/Button";
import { useLocale } from "@/lib/i18n/context";
import type { FloorBooth } from "@/components/floorplan/types";

interface Tier {
  sizeKey: string;
  label: string;
  priceAedFils: number;
  vatInclusive: boolean;
}

// A booth click never starts the hold by itself — this modal is the only
// path from "clicked" to "held." The server-side hold (POST
// /api/booths/[id]/hold) is still the sole source of truth on availability;
// this only decides WHEN that request fires, never whether it succeeds.
export function BoothConfirmModal({
  booth,
  tiers,
  eventName,
  busy,
  onConfirm,
  onCancel,
}: {
  booth: FloorBooth;
  tiers: Tier[];
  eventName: string;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { locale } = useLocale();
  const tier = tiers.find((t) => t.sizeKey === booth.size);
  const resolvedPrice = booth.priceAedFils ?? tier?.priceAedFils ?? null;
  const sizeLabel = tier?.label || booth.size;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink/40 px-0 sm:px-4" role="dialog" aria-modal="true" aria-label="Confirm booth">
      <div className="w-full sm:max-w-sm rounded-t-2xl sm:rounded-[10px] bg-cream border border-brown/10 p-6 sm:p-7">
        <p className="label-caps mb-1">{locale === "ar" ? "تأكيد الكشك" : "Confirm Booth"}</p>
        <h2 className="font-heading text-2xl text-brown-dark mb-5">
          {locale === "ar" ? `اختيار كشك ${booth.code}؟` : `Choose Booth ${booth.code}?`}
        </h2>

        <div className="space-y-3 mb-6 text-sm">
          <Row label={locale === "ar" ? "رمز الكشك" : "Booth code"} value={booth.code} />
          <Row label={locale === "ar" ? "المساحة" : "Size"} value={sizeLabel} />

          {resolvedPrice != null && tier?.vatInclusive ? (
            <>
              <Row label={locale === "ar" ? "سعر الكشك" : "Booth Price"} value={formatAed(splitVatInclusiveTotal(resolvedPrice).baseAedFils)} />
              <Row label={locale === "ar" ? "ضريبة القيمة المضافة" : "VAT"} value={formatAed(splitVatInclusiveTotal(resolvedPrice).vatAedFils)} />
              <div className="flex items-center justify-between gap-3 pt-2 border-t border-brown/10">
                <span className="text-brown-dark font-medium">{locale === "ar" ? "الإجمالي" : "Total"}</span>
                <span className="text-brown-dark font-semibold text-base">{formatAed(resolvedPrice)}</span>
              </div>
            </>
          ) : (
            <Row
              label={locale === "ar" ? "السعر" : "Price"}
              value={resolvedPrice != null ? formatAed(resolvedPrice) : locale === "ar" ? "سيتم التأكيد" : "To be confirmed"}
            />
          )}

          <Row label={locale === "ar" ? "الفعالية" : "Event"} value={eventName} />
        </div>

        <div className="flex flex-col gap-3">
          <Button onClick={onConfirm} loading={busy} size="lg" className="w-full">
            {locale === "ar" ? "تأكيد الكشك" : "Confirm Booth"}
          </Button>
          <Button onClick={onCancel} disabled={busy} variant="secondary" size="lg" className="w-full">
            {locale === "ar" ? "اختيار كشك آخر" : "Choose Another Booth"}
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
