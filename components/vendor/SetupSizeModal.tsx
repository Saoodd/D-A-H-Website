"use client";

import { useState } from "react";
import { useLocale } from "@/lib/i18n/context";
import { Button } from "@/components/ui/Button";
import { FieldError, fieldErrorRingClass } from "@/components/ui/FieldError";

// Collects the vendor's declared stand/kiosk footprint for THIS
// application, in meters (stored server-side as millimeters — see
// Application.setupWidthMm/setupDepthMm). Used both the first time (before
// booth selection) and later via "Edit Setup Size" if a booth turned out
// too small or the vendor mistyped a dimension. Never touches the
// vendor's general profile — this is per-booking, since a vendor may bring
// a different setup to different events.
export function SetupSizeModal({
  initialWidthMm,
  initialDepthMm,
  onCancel,
  onSave,
}: {
  initialWidthMm: number | null;
  initialDepthMm: number | null;
  onCancel: () => void;
  onSave: (widthMm: number, depthMm: number) => Promise<boolean>;
}) {
  const { locale } = useLocale();
  const isAr = locale === "ar";
  const [width, setWidth] = useState(initialWidthMm != null ? String(initialWidthMm / 1000) : "");
  const [depth, setDepth] = useState(initialDepthMm != null ? String(initialDepthMm / 1000) : "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSave() {
    const w = Number(width);
    const d = Number(depth);
    if (!width.trim() || !depth.trim() || !Number.isFinite(w) || !Number.isFinite(d) || w <= 0 || d <= 0) {
      setError(isAr ? "يرجى إدخال أبعاد صحيحة بالمتر." : "Please enter valid dimensions in meters.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const ok = await onSave(Math.round(w * 1000), Math.round(d * 1000));
      if (!ok) setError(isAr ? "تعذر حفظ المقاس. حاول مرة أخرى." : "Could not save your setup size. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink/40 px-0 sm:px-4" role="dialog" aria-modal="true" aria-label="Setup size">
      <div className="w-full sm:max-w-sm rounded-t-2xl sm:rounded-[10px] bg-cream border border-brown/10 p-6 sm:p-7">
        <p className="label-caps mb-1">{isAr ? "مساحة الإعداد" : "Setup Size"}</p>
        <h2 className="font-heading text-2xl text-brown-dark mb-2">{isAr ? "ما هي مساحة كشكك؟" : "What's your setup size?"}</h2>
        <p className="text-sm text-brown-light mb-5">
          {isAr ? "أدخل إجمالي المساحة الأرضية المطلوبة لجناحك/إعدادك." : "Enter the total floor space required for your stand/setup."}
        </p>

        <div className="grid grid-cols-2 gap-3 mb-2">
          <label className="flex flex-col gap-1 text-sm">
            {isAr ? "العرض (م)" : "Width (m)"}
            <input
              value={width}
              onChange={(e) => setWidth(e.target.value)}
              type="number"
              step="0.1"
              min="0"
              inputMode="decimal"
              className={`border rounded-lg px-3 py-2 bg-cream-soft ${error ? fieldErrorRingClass : "border-brown/20"}`}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {isAr ? "العمق (م)" : "Depth (m)"}
            <input
              value={depth}
              onChange={(e) => setDepth(e.target.value)}
              type="number"
              step="0.1"
              min="0"
              inputMode="decimal"
              className={`border rounded-lg px-3 py-2 bg-cream-soft ${error ? fieldErrorRingClass : "border-brown/20"}`}
            />
          </label>
        </div>
        <FieldError message={error ?? undefined} />

        <div className="flex flex-col gap-3 mt-5">
          <Button onClick={handleSave} loading={busy} size="lg" className="w-full">
            {isAr ? "حفظ" : "Save"}
          </Button>
          <Button onClick={onCancel} disabled={busy} variant="secondary" size="lg" className="w-full">
            {isAr ? "إلغاء" : "Cancel"}
          </Button>
        </div>
      </div>
    </div>
  );
}
