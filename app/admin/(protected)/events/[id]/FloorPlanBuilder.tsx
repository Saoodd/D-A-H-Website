"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FloorPlan } from "@/components/floorplan/FloorPlan";
import { Legend } from "@/components/floorplan/Legend";
import type { FloorBooth, FloorFeature, SizeStyle } from "@/components/floorplan/types";
import { FEATURE_TYPE, formatAed } from "@/lib/constants";

const SIZE_PALETTE = ["#C97C4B", "#8A5A38", "#D9A066", "#6B4429"];
const DEFAULT_BOOTH_W = 6;
const DEFAULT_BOOTH_H = 6;

interface AdminBooth extends FloorBooth {
  occupant: { applicationId: string | null; name: string } | null;
  priceAedFilsAtSale: number | null;
}

interface Tier {
  sizeKey: string;
  label: string;
  priceAedFils: number;
}

export function FloorPlanBuilder({
  eventId,
  tiers,
  floorPlanImageUrl,
}: {
  eventId: string;
  tiers: Tier[];
  floorPlanImageUrl: string | null;
}) {
  const [features, setFeatures] = useState<FloorFeature[]>([]);
  const [booths, setBooths] = useState<AdminBooth[]>([]);
  const [acceptedApplications, setAcceptedApplications] = useState<{ id: string; businessName: string }[]>([]);
  const [selected, setSelected] = useState<AdminBooth | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [bulkText, setBulkText] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [placementOn, setPlacementOn] = useState(false);
  const [placeSize, setPlaceSize] = useState(tiers[0]?.sizeKey || "");
  const [placePrefix, setPlacePrefix] = useState("A");

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/events/${eventId}/floorplan`);
    if (res.ok) {
      const data = await res.json();
      setFeatures(data.features);
      setBooths(data.booths);
      setAcceptedApplications(data.acceptedApplications);
    }
  }, [eventId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data fetch on mount
    load();
  }, [load]);

  const sizeStyles: Record<string, SizeStyle> = {};
  tiers.forEach((t, i) => {
    sizeStyles[t.sizeKey] = { color: SIZE_PALETTE[i % SIZE_PALETTE.length], label: `${t.label} — ${formatAed(t.priceAedFils)}` };
  });

  const nextCode = useMemo(() => {
    const prefix = placePrefix.trim() || "A";
    const usedNumbers = booths
      .map((b) => b.code)
      .filter((c) => c.startsWith(prefix))
      .map((c) => parseInt(c.slice(prefix.length), 10))
      .filter((n) => !Number.isNaN(n));
    const next = usedNumbers.length > 0 ? Math.max(...usedNumbers) + 1 : 1;
    return `${prefix}${next}`;
  }, [booths, placePrefix]);

  const handleCanvasClick = useCallback(
    async (xPercent: number, yPercent: number) => {
      if (!placeSize) {
        setNotice("Add a pricing tier first (Admin → Pricing) before placing booths.");
        return;
      }
      const w = DEFAULT_BOOTH_W;
      const h = DEFAULT_BOOTH_H;
      const gridX = Math.min(100 - w, Math.max(0, xPercent - w / 2));
      const gridY = Math.min(100 - h, Math.max(0, yPercent - h / 2));
      const res = await fetch(`/api/admin/events/${eventId}/booths`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: nextCode, size: placeSize, gridX, gridY, gridW: w, gridH: h }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setNotice(data.error || "Could not add booth");
      else await load();
    },
    [eventId, nextCode, placeSize, load]
  );

  async function addFeature(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const res = await fetch(`/api/admin/events/${eventId}/features`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: form.get("type"),
        label: form.get("label"),
        gridX: Number(form.get("gridX")),
        gridY: Number(form.get("gridY")),
        gridW: Number(form.get("gridW")),
        gridH: Number(form.get("gridH")),
        rotation: Number(form.get("rotation")) || 0,
      }),
    });
    if (res.ok) {
      (e.target as HTMLFormElement).reset();
      await load();
    }
  }

  async function submitBulk() {
    let parsed: unknown;
    try {
      parsed = JSON.parse(bulkText);
    } catch {
      setNotice("That's not valid JSON.");
      return;
    }
    const res = await fetch(`/api/admin/events/${eventId}/booths/bulk`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ booths: parsed }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) setNotice(data.error || "Bulk import failed");
    else {
      setNotice(`Imported: ${data.created} created, ${data.updated} updated.${data.errors.length ? ` ${data.errors.length} rows skipped.` : ""}`);
      setBulkText("");
      await load();
    }
  }

  async function saveSelected(patch: Record<string, unknown>) {
    if (!selected) return;
    const res = await fetch(`/api/admin/booths/${selected.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setNotice(data.error || "Could not save booth");
      return;
    }
    setSelected(null);
    await load();
  }

  async function deleteSelected() {
    if (!selected) return;
    if (!confirm(`Delete booth ${selected.code}?`)) return;
    await fetch(`/api/admin/booths/${selected.id}`, { method: "DELETE" });
    setSelected(null);
    await load();
  }

  return (
    <div>
      {notice && (
        <div className="mb-4 flex items-start justify-between gap-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-sm px-4 py-3">
          <span>{notice}</span>
          <button onClick={() => setNotice(null)} className="shrink-0 text-amber-700 underline text-xs">
            dismiss
          </button>
        </div>
      )}

      {!floorPlanImageUrl && (
        <p className="mb-3 text-xs text-brown-light">
          Tip: add a floor plan image URL in the event details above (a photo or scan of the real venue layout) — booths
          you place below will click-to-place directly onto it.
        </p>
      )}

      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-brown/10 bg-cream p-4">
        <label className="flex flex-col gap-1 text-xs text-brown-light">
          Booth size
          <select
            value={placeSize}
            onChange={(e) => setPlaceSize(e.target.value)}
            className="border border-brown/20 rounded-lg px-2 py-1.5 bg-cream-soft text-sm"
          >
            {tiers.map((t) => (
              <option key={t.sizeKey} value={t.sizeKey}>
                {t.sizeKey} — {t.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-brown-light">
          Code prefix
          <input
            value={placePrefix}
            onChange={(e) => setPlacePrefix(e.target.value.toUpperCase())}
            maxLength={3}
            className="border border-brown/20 rounded-lg px-2 py-1.5 bg-cream-soft text-sm w-16"
          />
        </label>
        <span className="text-xs text-brown-light">
          Next code: <strong className="text-brown">{nextCode}</strong>
        </span>
        <button
          type="button"
          onClick={() => setPlacementOn((v) => !v)}
          disabled={!placeSize}
          className={`ml-auto px-5 py-2 rounded-full text-sm disabled:opacity-50 ${
            placementOn ? "bg-green-700 text-white" : "bg-brown text-cream-soft"
          }`}
        >
          {placementOn ? "Placing — click the map (click again to stop)" : "Click to add booths"}
        </button>
      </div>

      <FloorPlan
        features={features}
        booths={booths}
        sizeStyles={sizeStyles}
        allowAnyStatusClick
        backgroundImageUrl={floorPlanImageUrl}
        placementMode={placementOn}
        onCanvasClick={handleCanvasClick}
        onSelectBooth={(b) => setSelected(b as AdminBooth)}
      />
      <Legend sizeStyles={sizeStyles} />

      {selected && (
        <div className="mt-4 rounded-xl border border-brown/20 bg-cream p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="font-heading text-lg text-brown-dark">Booth {selected.code}</p>
            <button onClick={() => setSelected(null)} className="text-xs text-brown-light underline">
              Close
            </button>
          </div>
          <p className="text-xs text-brown-light mb-3">
            Current status {selected.status}
            {selected.occupant && ` · Occupied by ${selected.occupant.name}`}
          </p>

          <div className="grid sm:grid-cols-2 gap-3 text-sm">
            <label className="flex flex-col gap-1">
              Code
              <input id="booth-code" defaultValue={selected.code} className="border border-brown/20 rounded-lg px-3 py-2 bg-cream-soft" />
            </label>
            <label className="flex flex-col gap-1">
              Size
              <select id="booth-size" defaultValue={selected.size} className="border border-brown/20 rounded-lg px-3 py-2 bg-cream-soft">
                {tiers.map((t) => (
                  <option key={t.sizeKey} value={t.sizeKey}>
                    {t.sizeKey}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              Status
              <select
                defaultValue={selected.status}
                id="booth-status-select"
                className="border border-brown/20 rounded-lg px-3 py-2 bg-cream-soft"
              >
                <option value="AVAILABLE">Available</option>
                <option value="RESERVED">Reserved</option>
                <option value="SOLD">Sold</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              Assign to approved applicant
              <select id="booth-assign-select" defaultValue={selected.occupant?.applicationId || ""} className="border border-brown/20 rounded-lg px-3 py-2 bg-cream-soft">
                <option value="">— none —</option>
                {acceptedApplications.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.businessName}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 sm:col-span-2">
              Or a manual name (walk-in / favor, no application on file)
              <input id="booth-manual-name" defaultValue={selected.occupant?.applicationId ? "" : selected.occupant?.name || ""} className="border border-brown/20 rounded-lg px-3 py-2 bg-cream-soft" />
            </label>

            <details className="sm:col-span-2">
              <summary className="text-xs text-brown-light cursor-pointer">Fine-tune position &amp; size (%)</summary>
              <div className="mt-2 grid grid-cols-4 gap-2">
                <input id="booth-x" type="number" step="0.5" defaultValue={selected.gridX} placeholder="X" className="border border-brown/20 rounded-lg px-2 py-1.5 bg-cream-soft text-xs" />
                <input id="booth-y" type="number" step="0.5" defaultValue={selected.gridY} placeholder="Y" className="border border-brown/20 rounded-lg px-2 py-1.5 bg-cream-soft text-xs" />
                <input id="booth-w" type="number" step="0.5" defaultValue={selected.gridW} placeholder="W" className="border border-brown/20 rounded-lg px-2 py-1.5 bg-cream-soft text-xs" />
                <input id="booth-h" type="number" step="0.5" defaultValue={selected.gridH} placeholder="H" className="border border-brown/20 rounded-lg px-2 py-1.5 bg-cream-soft text-xs" />
              </div>
            </details>
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            <button
              onClick={() => {
                const status = (document.getElementById("booth-status-select") as HTMLSelectElement).value;
                const assignedApplicationId = (document.getElementById("booth-assign-select") as HTMLSelectElement).value;
                const manualAssigneeName = (document.getElementById("booth-manual-name") as HTMLInputElement).value;
                const code = (document.getElementById("booth-code") as HTMLInputElement).value;
                const size = (document.getElementById("booth-size") as HTMLSelectElement).value;
                const x = (document.getElementById("booth-x") as HTMLInputElement).value;
                const y = (document.getElementById("booth-y") as HTMLInputElement).value;
                const w = (document.getElementById("booth-w") as HTMLInputElement).value;
                const h = (document.getElementById("booth-h") as HTMLInputElement).value;
                saveSelected({
                  status,
                  code,
                  size,
                  gridX: Number(x),
                  gridY: Number(y),
                  gridW: Number(w),
                  gridH: Number(h),
                  assignedApplicationId: assignedApplicationId || null,
                  manualAssigneeName: assignedApplicationId ? null : manualAssigneeName || null,
                });
              }}
              className="px-5 py-2 rounded-full bg-brown text-cream-soft text-sm"
            >
              Save
            </button>
            <button
              onClick={() => saveSelected({ status: "AVAILABLE", assignedApplicationId: null, manualAssigneeName: null })}
              className="px-5 py-2 rounded-full border border-brown/30 text-sm"
            >
              Clear to available
            </button>
            <button onClick={deleteSelected} className="px-5 py-2 rounded-full border border-red-300 text-red-700 text-sm">
              Delete booth
            </button>
          </div>
        </div>
      )}

      <div className="mt-8">
        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          className="text-xs text-brown-light underline"
        >
          {showAdvanced ? "Hide advanced tools" : "Advanced: add structural features / bulk-import booths"}
        </button>
      </div>

      {showAdvanced && (
        <div className="mt-4 space-y-6">
          <form onSubmit={addFeature} className="rounded-xl border border-brown/10 bg-cream-soft p-5">
            <p className="text-sm font-medium text-brown-dark mb-3">
              Add a structural feature (entrance, toilets, office, loading, stairs)
            </p>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <select name="type" className="border border-brown/20 rounded-lg px-2 py-1.5 bg-cream col-span-2">
                {FEATURE_TYPE.map((t) => (
                  <option key={t} value={t}>
                    {t.replaceAll("_", " ")}
                  </option>
                ))}
              </select>
              <input name="label" placeholder="Label" required className="border border-brown/20 rounded-lg px-2 py-1.5 bg-cream col-span-2" />
              <input name="gridX" type="number" step="0.5" placeholder="X %" required className="border border-brown/20 rounded-lg px-2 py-1.5 bg-cream" />
              <input name="gridY" type="number" step="0.5" placeholder="Y %" required className="border border-brown/20 rounded-lg px-2 py-1.5 bg-cream" />
              <input name="gridW" type="number" step="0.5" placeholder="Width %" required className="border border-brown/20 rounded-lg px-2 py-1.5 bg-cream" />
              <input name="gridH" type="number" step="0.5" placeholder="Height %" required className="border border-brown/20 rounded-lg px-2 py-1.5 bg-cream" />
              <input name="rotation" type="number" placeholder="Rotation °" className="border border-brown/20 rounded-lg px-2 py-1.5 bg-cream col-span-2" />
            </div>
            <button type="submit" className="mt-3 px-4 py-2 rounded-full bg-brown text-cream-soft text-sm">
              Add feature
            </button>
          </form>

          <div className="rounded-xl border border-brown/10 bg-cream-soft p-5">
            <p className="text-sm font-medium text-brown-dark mb-2">Bulk import booths (paste JSON)</p>
            <p className="text-xs text-brown-light mb-3">
              {'Array of {"code","size","gridX","gridY","gridW","gridH"} (X/Y/W/H as % of the canvas, 0-100) — paste the full real booth list here once confirmed. Existing codes are updated in place; new codes are created as available.'}
            </p>
            <textarea
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              rows={6}
              placeholder='[{"code":"A1","size":"2x2","gridX":10,"gridY":10,"gridW":6,"gridH":6}]'
              className="w-full border border-brown/20 rounded-lg px-3 py-2 bg-cream text-xs font-mono"
            />
            <button onClick={submitBulk} className="mt-3 px-4 py-2 rounded-full bg-brown text-cream-soft text-sm">
              Import
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
