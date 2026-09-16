"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale } from "@/lib/i18n/context";
import { formatAed, splitVatInclusiveTotal } from "@/lib/constants";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";
import { FloorPlan } from "@/components/floorplan/FloorPlan";
import { Legend } from "@/components/floorplan/Legend";
import type { FloorFeature, FloorBooth, SizeStyle } from "@/components/floorplan/types";

interface Tier {
  sizeKey: string;
  label: string;
  priceAedFils: number;
  vatInclusive: boolean;
}

/** Turns a sizeKey like "3x2" into "3 × 2 m" — the real per-booth dimension,
 *  read from data rather than a fabricated tier name (this system has no
 *  "Platinum/Gold/Silver" branding; a tier's real identity IS its size). */
function dimensionLabel(sizeKey: string): string | null {
  const m = /^(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)$/i.exec(sizeKey.trim());
  return m ? `${m[1]} × ${m[2]} m` : null;
}

function boothSizeText(booth: FloorBooth, tier: Tier | undefined): string {
  return dimensionLabel(booth.size) ?? tier?.label ?? booth.size;
}

function boothPrice(booth: FloorBooth, tier: Tier | undefined): number | null {
  return booth.priceAedFils ?? tier?.priceAedFils ?? null;
}

const statusTone = { AVAILABLE: "positive", HELD: "attention", RESERVED: "neutral", SOLD: "neutral" } as const;

/** The full vendor booth-selection experience: an interactive floor map
 *  paired with a searchable/filterable list of the same authoritative
 *  booth data, kept in one synchronized selection state (never two that can
 *  disagree). On desktop/tablet both panes show at once; on mobile a
 *  Map/List toggle switches between them without losing the selection.
 *
 *  This never holds a booth itself — selecting one here only shows an
 *  inline preview panel with a "Confirm" action. That action is the ONLY
 *  thing that hands control back to the caller (onConfirmBooth), which
 *  drives the existing BoothConfirmModal + POST /api/booths/[id]/hold flow
 *  completely unchanged. */
export function BoothSelector({
  features,
  booths,
  tiers,
  sizeStyles,
  backgroundImageUrl,
  venueWidthM,
  onConfirmBooth,
  onBoothBecameUnavailable,
  excludeIds = [],
  confirmLabel,
}: {
  features: FloorFeature[];
  booths: FloorBooth[];
  tiers: Tier[];
  sizeStyles: Record<string, SizeStyle>;
  backgroundImageUrl: string | null;
  venueWidthM?: number | null;
  onConfirmBooth: (booth: FloorBooth) => void;
  /** Fires once if the vendor's current browsing selection is taken by
   *  someone else (or otherwise stops being available) while they're still
   *  deciding — before they ever pressed Confirm, including while the
   *  confirm modal itself is still open (selectedId stays set the whole
   *  time it's open). The caller shows the actual notice text (same banner
   *  used for the confirm-time race) and, if a confirm modal for this exact
   *  booth is open, should close it too — passed the booth so it can tell. */
  onBoothBecameUnavailable?: (booth: FloorBooth) => void;
  /** Booths already picked in a multi-booth selection round — rendered as
   *  "Added" rather than a normal available/unavailable status, and never
   *  re-selectable (the vendor removes them from the parent's staged list
   *  instead, not by re-clicking here). Purely a client-side display/
   *  interaction filter: these booths are still genuinely AVAILABLE
   *  server-side until the final atomic hold actually claims them. */
  excludeIds?: string[];
  /** Overrides the preview panel's confirm button copy (e.g. "Add This
   *  Booth" instead of "Confirm B3") when staging a second booth. */
  confirmLabel?: (booth: FloorBooth) => string;
}) {
  const { locale } = useLocale();
  const isAr = locale === "ar";

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [listHoverId, setListHoverId] = useState<string | null>(null);
  const [mapHoverId, setMapHoverId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [tierFilter, setTierFilter] = useState<string | null>(null);
  const [showUnavailable, setShowUnavailable] = useState(false);
  const [mobileView, setMobileView] = useState<"map" | "list">("map");
  const [focusNonce, setFocusNonce] = useState(0);

  // If the currently-selected booth stops being pickable (someone else took
  // it, an admin reserved it, etc.) while the vendor is still browsing —
  // before they've even opened the confirm step — drop the selection and
  // tell the caller, instead of leaving a stale "selected" state pointing
  // at a booth that can no longer be confirmed.
  useEffect(() => {
    if (!selectedId) return;
    const b = booths.find((x) => x.id === selectedId);
    if (b && b.status !== "AVAILABLE" && !b.isMine) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reacting to external data (a periodic floorplan re-fetch), not a render-time derivation
      setSelectedId(null);
      onBoothBecameUnavailable?.(b);
    }
  }, [booths, selectedId, onBoothBecameUnavailable]);

  // Re-center the map whenever we switch INTO map view with a selection
  // active — covers both the explicit "View on Map" action and just tapping
  // the Map tab after picking something in List view. A plain focusBoothId
  // change alone isn't enough here because the map may have been hidden
  // (display:none) at the moment the selection was made, which measures as
  // zero-sized and can't center correctly the first time.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncs the map's pan/zoom to an external prop (FloorPlan), not a render-time derivation
    if (mobileView === "map" && selectedId) setFocusNonce((n) => n + 1);
  }, [mobileView, selectedId]);

  const tierBySizeKey = useMemo(() => new Map(tiers.map((t) => [t.sizeKey, t])), [tiers]);

  const isExcluded = (id: string) => excludeIds.includes(id);

  const filteredBooths = useMemo(() => {
    const q = search.trim().toUpperCase();
    return booths
      .filter((b) => (showUnavailable ? true : (b.status === "AVAILABLE" || b.isMine) && !isExcluded(b.id)))
      .filter((b) => !tierFilter || b.size === tierFilter)
      .filter((b) => !q || b.code.toUpperCase().includes(q))
      .sort((a, b) => {
        const aAvail = (a.status === "AVAILABLE" || a.isMine) && !isExcluded(a.id);
        const bAvail = (b.status === "AVAILABLE" || b.isMine) && !isExcluded(b.id);
        if (aAvail !== bAvail) return aAvail ? -1 : 1;
        return a.code.localeCompare(b.code, undefined, { numeric: true, sensitivity: "base" });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- excludeIds compared by isExcluded closure, not identity
  }, [booths, search, tierFilter, showUnavailable, excludeIds]);

  const availableCount = useMemo(
    () => booths.filter((b) => (b.status === "AVAILABLE" || b.isMine) && !isExcluded(b.id)).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps -- excludeIds compared by isExcluded closure, not identity
    [booths, excludeIds]
  );

  const selectedBooth = selectedId ? booths.find((b) => b.id === selectedId) ?? null : null;
  const highlightedFromList = listHoverId;
  const highlightedFromMap = mapHoverId;

  function selectBooth(booth: FloorBooth) {
    if (isExcluded(booth.id)) return;
    if (booth.status !== "AVAILABLE" && !booth.isMine) return;
    setSelectedId(booth.id);
  }

  const mapPane = (
    <div>
      <FloorPlan
        features={features}
        booths={booths}
        sizeStyles={sizeStyles}
        backgroundImageUrl={backgroundImageUrl}
        venueWidthM={venueWidthM}
        selectedBoothId={selectedId}
        onSelectBooth={selectBooth}
        highlightedBoothId={highlightedFromList}
        onHoverBooth={setMapHoverId}
        focusBoothId={selectedId}
        focusNonce={focusNonce}
      />
      <Legend sizeStyles={sizeStyles} />
    </div>
  );

  const listPane = (
    <div className="flex flex-col h-full">
      <div className="relative mb-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={isAr ? "ابحث برقم الكشك، مثل P01، B14..." : "Search P01, B14, A6…"}
          className="w-full border border-brown/20 rounded-lg pl-9 pr-3 py-2.5 bg-cream-soft text-sm placeholder:text-brown-light/70"
          aria-label={isAr ? "بحث عن كشك" : "Search booth number"}
        />
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="absolute left-3 top-1/2 -translate-y-1/2 text-brown-light pointer-events-none"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>
      </div>

      {tiers.length > 1 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          <button
            type="button"
            onClick={() => setTierFilter(null)}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
              tierFilter === null ? "bg-brown text-cream-soft border-brown" : "border-brown/25 text-brown-dark hover:bg-brown/5"
            }`}
          >
            {isAr ? "الكل" : "All"}
          </button>
          {tiers.map((t) => (
            <button
              key={t.sizeKey}
              type="button"
              onClick={() => setTierFilter((cur) => (cur === t.sizeKey ? null : t.sizeKey))}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                tierFilter === t.sizeKey ? "bg-brown text-cream-soft border-brown" : "border-brown/25 text-brown-dark hover:bg-brown/5"
              }`}
            >
              {dimensionLabel(t.sizeKey) ?? t.label}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between mb-3">
        <p className="label-caps">{isAr ? "الأكشاك المتاحة" : "Available Booths"}</p>
        <label className="flex items-center gap-1.5 text-xs text-brown-light cursor-pointer select-none">
          <input type="checkbox" checked={showUnavailable} onChange={(e) => setShowUnavailable(e.target.checked)} className="accent-brown" />
          {isAr ? "إظهار غير المتاح" : "Show unavailable"}
        </label>
      </div>

      {availableCount === 0 && !showUnavailable ? (
        <div className="rounded-[10px] border border-brown/10 bg-cream p-6 text-center">
          <p className="text-sm text-brown-dark mb-3">{isAr ? "لا توجد أكشاك متاحة حالياً." : "No booths currently available."}</p>
          <a href="/contact" className="text-xs underline text-brown">
            {isAr ? "تواصل مع دار الحي" : "Contact DAH"}
          </a>
        </div>
      ) : filteredBooths.length === 0 ? (
        <div className="rounded-[10px] border border-brown/10 bg-cream p-6 text-center">
          <p className="text-sm text-brown-light">{isAr ? "لا توجد نتائج مطابقة." : "No booths match your search."}</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto max-h-[52vh] md:max-h-[60vh] -mx-1 px-1 space-y-1.5">
          {filteredBooths.map((b) => {
            const tier = tierBySizeKey.get(b.size);
            const price = boothPrice(b, tier);
            const excluded = isExcluded(b.id);
            const available = (b.status === "AVAILABLE" || b.isMine) && !excluded;
            const isSelected = selectedId === b.id;
            const isHighlighted = highlightedFromMap === b.id;
            return (
              <button
                key={b.id}
                type="button"
                disabled={!available}
                onClick={() => selectBooth(b)}
                onMouseEnter={() => available && setListHoverId(b.id)}
                onMouseLeave={() => setListHoverId((cur) => (cur === b.id ? null : cur))}
                data-booth-code={b.code}
                className={`w-full text-left rounded-[8px] border px-3.5 py-3 flex items-center justify-between gap-3 transition-colors ${
                  isSelected
                    ? "border-emerald-700 bg-emerald-700/[0.06]"
                    : excluded
                    ? "border-emerald-700/40 bg-emerald-700/[0.03]"
                    : isHighlighted && available
                    ? "border-brown/40 bg-brown/[0.04]"
                    : "border-brown/10 bg-cream"
                } ${available ? "cursor-pointer" : "cursor-not-allowed opacity-60"}`}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-heading text-lg text-brown-dark">{b.code}</span>
                    {isSelected && <StatusBadge label={isAr ? "محدد" : "Selected"} tone="positive" />}
                    {!isSelected && excluded && <StatusBadge label={isAr ? "مُضاف" : "Added"} tone="positive" />}
                    {!isSelected && !excluded && (
                      <StatusBadge label={statusLabel(b, isAr)} tone={statusTone[b.status as keyof typeof statusTone] ?? "neutral"} />
                    )}
                  </div>
                  <p className="text-xs text-brown-light mt-0.5 truncate">{boothSizeText(b, tier)}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-medium text-brown-dark">{price != null ? formatAed(price) : "—"}</p>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );

  return (
    <div>
      {/* Mobile-only Map/List switch — desktop shows both panes at once. */}
      <div className="md:hidden flex mb-4 rounded-full border border-brown/20 p-0.5 bg-cream-soft">
        {(["map", "list"] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setMobileView(v)}
            className={`flex-1 text-sm py-2 rounded-full transition-colors ${
              mobileView === v ? "bg-brown text-cream-soft" : "text-brown-dark"
            }`}
          >
            {v === "map" ? (isAr ? "خريطة الموقع" : "Map View") : isAr ? "قائمة الأكشاك" : "List View"}
          </button>
        ))}
      </div>

      {selectedBooth && (
        <div className="md:hidden mb-4">
          <SelectedBoothPanel
            booth={selectedBooth}
            tier={tierBySizeKey.get(selectedBooth.size)}
            onConfirm={() => onConfirmBooth(selectedBooth)}
            onChooseAnother={() => setSelectedId(null)}
            onViewOnMap={mobileView === "list" ? () => setMobileView("map") : undefined}
            confirmLabel={confirmLabel?.(selectedBooth)}
          />
        </div>
      )}

      <div className="grid md:grid-cols-[1fr_380px] gap-5 items-start">
        <div className={mobileView === "list" ? "hidden md:block" : ""}>{mapPane}</div>
        <div className={mobileView === "map" ? "hidden md:block" : ""}>
          {selectedBooth && (
            <div className="hidden md:block mb-4">
              <SelectedBoothPanel
                booth={selectedBooth}
                tier={tierBySizeKey.get(selectedBooth.size)}
                onConfirm={() => onConfirmBooth(selectedBooth)}
                onChooseAnother={() => setSelectedId(null)}
                confirmLabel={confirmLabel?.(selectedBooth)}
              />
            </div>
          )}
          {listPane}
        </div>
      </div>
    </div>
  );
}

function statusLabel(b: FloorBooth, isAr: boolean): string {
  switch (b.status) {
    case "AVAILABLE":
      return isAr ? "متاح" : "Available";
    case "HELD":
      return isAr ? "محجوز مؤقتاً" : "Held";
    case "RESERVED":
      return isAr ? "غير متاح" : "Unavailable";
    case "SOLD":
      return isAr ? "مباع" : "Booked";
    default:
      return b.status;
  }
}

/** The pre-confirm preview panel shown once a booth is selected from either
 *  the map or the list — "Confirm" is the ONLY path from here into the
 *  existing BoothConfirmModal / server-side hold; nothing is reserved just
 *  by browsing to this panel. */
function SelectedBoothPanel({
  booth,
  tier,
  onConfirm,
  onChooseAnother,
  onViewOnMap,
  confirmLabel,
}: {
  booth: FloorBooth;
  tier: Tier | undefined;
  onConfirm: () => void;
  onChooseAnother: () => void;
  onViewOnMap?: () => void;
  confirmLabel?: string;
}) {
  const { locale } = useLocale();
  const isAr = locale === "ar";
  const price = boothPrice(booth, tier);
  const vatInclusive = tier?.vatInclusive ?? true;
  const split = price != null && vatInclusive ? splitVatInclusiveTotal(price) : null;

  return (
    <div className="rounded-[10px] border border-emerald-700/25 bg-emerald-700/[0.04] p-5">
      <p className="label-caps mb-2 text-emerald-800">{isAr ? "الكشك المختار" : "Your Selected Booth"}</p>
      <div className="flex items-baseline justify-between gap-3 mb-1">
        <span className="font-heading text-2xl text-brown-dark">{booth.code}</span>
        {price != null && !split && <span className="text-sm font-medium text-brown-dark">{formatAed(price)}</span>}
      </div>
      <p className="text-xs text-brown-light mb-4">{boothSizeText(booth, tier)}</p>

      {split && (
        <div className="space-y-1.5 mb-4 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-brown-light">{isAr ? "المجموع الفرعي" : "Subtotal"}</span>
            <span className="text-brown-dark">{formatAed(split.baseAedFils)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-brown-light">{isAr ? "ضريبة القيمة المضافة" : "VAT"}</span>
            <span className="text-brown-dark">{formatAed(split.vatAedFils)}</span>
          </div>
          <div className="flex items-center justify-between pt-1.5 border-t border-brown/10">
            <span className="text-brown-dark font-medium">{isAr ? "الإجمالي" : "Total"}</span>
            <span className="text-brown-dark font-semibold">{formatAed(price!)}</span>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <Button onClick={onConfirm} size="md" className="w-full">
          {confirmLabel ?? (isAr ? `تأكيد ${booth.code}` : `Confirm ${booth.code}`)}
        </Button>
        {onViewOnMap && (
          <Button onClick={onViewOnMap} variant="secondary" size="sm" className="w-full">
            {isAr ? "عرض على الخريطة" : "View on Map"}
          </Button>
        )}
        <Button onClick={onChooseAnother} variant="ghost" size="sm" className="w-full">
          {isAr ? "اختيار كشك آخر" : "Choose Another"}
        </Button>
      </div>
    </div>
  );
}
