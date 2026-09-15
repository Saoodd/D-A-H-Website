"use client";

import { useLocale } from "@/lib/i18n/context";
import { SizeStyle } from "./types";

export function Legend({
  sizeStyles,
  showMineKey = false,
}: {
  sizeStyles: Record<string, SizeStyle>;
  /** Adds a "Your Booth" key using the same green outline FloorPlan uses
   *  for `isMine` booths — shown on the read-only confirmed-booking view,
   *  where every other booth reads as "Other Booths"/"Unavailable" rather
   *  than by its own size/price (that distinction stops mattering once the
   *  vendor's own booking is already settled). */
  showMineKey?: boolean;
}) {
  const { t, locale } = useLocale();
  const isAr = locale === "ar";
  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-brown-light">
      <span className="font-medium text-brown">{t("floorplan.legend")}:</span>
      {showMineKey ? (
        <>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm inline-block border-2" style={{ borderColor: "#2E7D32", background: "#C97C4B" }} />
            {isAr ? "كشكك" : "Your Booth"}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm inline-block bg-[#B58A63]" /> {isAr ? "أكشاك أخرى" : "Other Booths"}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm inline-block bg-[#6B7280] opacity-55" /> {isAr ? "غير متاح" : "Unavailable"}
          </span>
        </>
      ) : (
        <>
          {Object.entries(sizeStyles).map(([key, s]) => (
            <span key={key} className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm inline-block" style={{ background: s.color }} />
              {s.label}
            </span>
          ))}
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm inline-block bg-[#E9C46A]" /> {t("floorplan.held")}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm inline-block bg-[#9CA3AF]" /> {t("floorplan.reserved")}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm inline-block bg-[#6B7280] opacity-55" /> {t("floorplan.sold")}
          </span>
        </>
      )}
    </div>
  );
}
