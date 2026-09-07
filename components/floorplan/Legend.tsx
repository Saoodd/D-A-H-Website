"use client";

import { useLocale } from "@/lib/i18n/context";
import { SizeStyle } from "./types";

export function Legend({ sizeStyles }: { sizeStyles: Record<string, SizeStyle> }) {
  const { t } = useLocale();
  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-brown-light">
      <span className="font-medium text-brown">{t("floorplan.legend")}:</span>
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
    </div>
  );
}
