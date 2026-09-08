"use client";

import { useCallback, useEffect, useState } from "react";
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
  floorPlanImageUrl: initialFloorPlanImageUrl,
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
  const [floorPlanImageUrl, setFloorPlanImageUrl] = useState(initialFloorPlanImageUrl);
  const [uploadingImage, setUploadingImage] = useState(false);

  const [placementOn, setPlacementOn] = useState(false);
  const [placeName, setPlaceName] = useState("");
  const [placePrice, setPlacePrice] = useState("");
  const [placeColor, setPlaceColor] = useState("#C97C4B");

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

  const handleCanvasClick = useCallback(
    async (xPercent: number, yPercent: number) => {
      const name = placeName.trim();
      if (!name) {
        setNotice("Type a booth name first.");
        return;
      }
      if (!placePrice.trim()) {
        setNotice("Enter a price for the booth first.");
        return;
      }
      const w = DEFAULT_BOOTH_W;
      const h = DEFAULT_BOOTH_H;
      const gridX = Math.min(100 - w, Math.max(0, xPercent - w / 2));
      const gridY = Math.min(100 - h, Math.max(0, yPercent - h / 2));
      const res = await fetch(`/api/admin/events/${eventId}/booths`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: name,
          size: "custom",
          priceAedFils: placePrice ? Math.round(Number(placePrice) * 100) : null,
          colorHex: placeColor || null,
          gridX,
          gridY,
          gridW: w,
          gridH: h,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setNotice(data.error || "Could not add booth");
      else {
        setPlaceName("");
        await load();
      }
    },
    [eventId, placeName, placePrice, placeColor, load]
  );

  async function uploadFloorPlanImage(file: File) {
    setUploadingImage(true);
    setNotice(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const uploadRes = await fetch("/api/admin/upload", { method: "POST", body: form });
      const uploadData = await uploadRes.json().catch(() => ({}));
      if (!uploadRes.ok) {
        setNotice(uploadData.error || "Upload failed");
        return;
      }
      const patchRes = await fetch(`/api/admin/events/${eventId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ floorPlanImageUrl: uploadData.url }),
      });
      if (!patchRes.ok) {
        setNotice("Image uploaded, but saving it to the event failed. Try again.");
        return;
      }
      setFloorPlanImageUrl(uploadData.url);
    } finally {
      setUploadingImage(false);
    }
  }

  const onBoothCommit = useCallback(
    async (id: string, patch: Record<string, number>) => {
      setBooths((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)));
      const res = await fetch(`/api/admin/booths/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        setNotice("Could not save that change — reloading.");
        await load();
      }
    },
    [load]
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

      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-brown/10 bg-cream p-4">
        <div className="flex-1 min-w-[220px]">
          <p className="text-sm font-medium text-brown-dark">Floor plan image</p>
          <p className="text-xs text-brown-light">
            {floorPlanImageUrl
              ? "Upload a different photo/scan to replace it."
              : "Upload a photo or scan of the real venue layout — booths you place will click-to-place directly onto it."}
          </p>
        </div>
        <label className="px-4 py-2 rounded-full border border-brown/30 text-sm cursor-pointer hover:bg-brown hover:text-cream-soft transition-colors">
          {uploadingImage ? "Uploading…" : floorPlanImageUrl ? "Replace image" : "Upload image"}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="hidden"
            disabled={uploadingImage}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) uploadFloorPlanImage(file);
            }}
          />
        </label>
        {floorPlanImageUrl && (
          <button
            type="button"
            onClick={async () => {
              await fetch(`/api/admin/events/${eventId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ floorPlanImageUrl: null }),
              });
              setFloorPlanImageUrl(null);
            }}
            className="text-xs text-red-700 underline"
          >
            Remove image
          </button>
        )}
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-brown/10 bg-cream p-4">
        <label className="flex flex-col gap-1 text-xs text-brown-light">
          Name of booth <span className="text-brown-light/60">(ex: B25)</span>
          <input
            value={placeName}
            onChange={(e) => setPlaceName(e.target.value)}
            placeholder="B25"
            className="border border-brown/20 rounded-lg px-2 py-1.5 bg-cream-soft text-sm w-28"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-brown-light">
          Price of booth (AED) <span className="text-brown-light/60">(ex: 1837.5)</span>
          <input
            value={placePrice}
            onChange={(e) => setPlacePrice(e.target.value)}
            type="number"
            step="0.01"
            min="0"
            required
            placeholder="1837.5"
            className="border border-brown/20 rounded-lg px-2 py-1.5 bg-cream-soft text-sm w-28"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-brown-light">
          Color
          <div className="flex items-center gap-1.5">
            <input
              type="color"
              value={/^#[0-9a-fA-F]{6}$/.test(placeColor) ? placeColor : "#C97C4B"}
              onChange={(e) => setPlaceColor(e.target.value)}
              className="w-8 h-8 rounded border border-brown/20 bg-cream-soft cursor-pointer p-0.5"
            />
            <input
              value={placeColor}
              onChange={(e) => setPlaceColor(e.target.value)}
              placeholder="#C97C4B"
              maxLength={7}
              className="border border-brown/20 rounded-lg px-2 py-1.5 bg-cream-soft text-sm w-24 font-mono"
            />
          </div>
        </label>
        <button
          type="button"
          onClick={() => setPlacementOn((v) => !v)}
          disabled={!placementOn && (!placeName.trim() || !placePrice.trim())}
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
        selectedBoothId={selected?.id ?? null}
        allowAnyStatusClick
        backgroundImageUrl={floorPlanImageUrl}
        placementMode={placementOn}
        onCanvasClick={handleCanvasClick}
        onSelectBooth={(b) => setSelected(b as AdminBooth)}
        editable={!placementOn}
        onBoothCommit={onBoothCommit}
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
              Price (AED) <span className="text-brown-light/60 text-xs">(blank = use pricing tier)</span>
              <input
                id="booth-price"
                type="number"
                step="0.01"
                min="0"
                defaultValue={selected.priceAedFils != null ? selected.priceAedFils / 100 : ""}
                placeholder="e.g. 1837.5"
                className="border border-brown/20 rounded-lg px-3 py-2 bg-cream-soft"
              />
            </label>
            <label className="flex flex-col gap-1">
              Color
              <div className="flex items-center gap-1.5">
                <input
                  id="booth-color-picker"
                  type="color"
                  defaultValue={
                    selected.colorHex && /^#[0-9a-fA-F]{6}$/.test(selected.colorHex) ? selected.colorHex : "#C97C4B"
                  }
                  onChange={(e) => {
                    const textInput = document.getElementById("booth-color") as HTMLInputElement | null;
                    if (textInput) textInput.value = e.target.value;
                  }}
                  className="w-9 h-9 rounded border border-brown/20 bg-cream-soft cursor-pointer p-0.5"
                />
                <input
                  id="booth-color"
                  defaultValue={selected.colorHex || ""}
                  placeholder="blank = use size color"
                  maxLength={7}
                  className="border border-brown/20 rounded-lg px-3 py-2 bg-cream-soft flex-1 font-mono"
                />
              </div>
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

            <p className="sm:col-span-2 text-xs text-brown-light -mb-1">
              Tip: drag the booth to move it, its corner handles to resize, and the handle above it to rotate — or fine-tune exact numbers below.
            </p>
            <details className="sm:col-span-2">
              <summary className="text-xs text-brown-light cursor-pointer">Fine-tune position, size &amp; rotation</summary>
              <div className="mt-2 grid grid-cols-5 gap-2">
                <input id="booth-x" type="number" step="0.5" defaultValue={selected.gridX} placeholder="X %" className="border border-brown/20 rounded-lg px-2 py-1.5 bg-cream-soft text-xs" />
                <input id="booth-y" type="number" step="0.5" defaultValue={selected.gridY} placeholder="Y %" className="border border-brown/20 rounded-lg px-2 py-1.5 bg-cream-soft text-xs" />
                <input id="booth-w" type="number" step="0.5" defaultValue={selected.gridW} placeholder="W %" className="border border-brown/20 rounded-lg px-2 py-1.5 bg-cream-soft text-xs" />
                <input id="booth-h" type="number" step="0.5" defaultValue={selected.gridH} placeholder="H %" className="border border-brown/20 rounded-lg px-2 py-1.5 bg-cream-soft text-xs" />
                <input id="booth-rotation" type="number" step="1" defaultValue={selected.rotation ?? 0} placeholder="Rotate °" className="border border-brown/20 rounded-lg px-2 py-1.5 bg-cream-soft text-xs" />
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
                const price = (document.getElementById("booth-price") as HTMLInputElement).value;
                const color = (document.getElementById("booth-color") as HTMLInputElement).value.trim();
                const x = (document.getElementById("booth-x") as HTMLInputElement).value;
                const y = (document.getElementById("booth-y") as HTMLInputElement).value;
                const w = (document.getElementById("booth-w") as HTMLInputElement).value;
                const h = (document.getElementById("booth-h") as HTMLInputElement).value;
                const rotation = (document.getElementById("booth-rotation") as HTMLInputElement).value;
                saveSelected({
                  status,
                  code,
                  priceAedFils: price ? Math.round(Number(price) * 100) : null,
                  colorHex: color || null,
                  gridX: Number(x),
                  gridY: Number(y),
                  gridW: Number(w),
                  gridH: Number(h),
                  rotation: rotation ? Number(rotation) : 0,
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
