"use client";

import { useCallback, useEffect, useState } from "react";
import { FloorPlan } from "@/components/floorplan/FloorPlan";
import { Legend } from "@/components/floorplan/Legend";
import type { FloorBooth, FloorFeature, SizeStyle } from "@/components/floorplan/types";
import { FEATURE_TYPE, formatAed } from "@/lib/constants";

const SIZE_PALETTE = ["#C97C4B", "#8A5A38", "#D9A066", "#6B4429"];

interface AdminBooth extends FloorBooth {
  occupant: { applicationId: string | null; name: string } | null;
  priceAedFilsAtSale: number | null;
}

interface Tier {
  sizeKey: string;
  label: string;
  priceAedFils: number;
}

export function FloorPlanBuilder({ eventId, tiers }: { eventId: string; tiers: Tier[] }) {
  const [features, setFeatures] = useState<FloorFeature[]>([]);
  const [booths, setBooths] = useState<AdminBooth[]>([]);
  const [acceptedApplications, setAcceptedApplications] = useState<{ id: string; businessName: string }[]>([]);
  const [selected, setSelected] = useState<AdminBooth | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [bulkText, setBulkText] = useState("");

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

  async function addBooth(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const res = await fetch(`/api/admin/events/${eventId}/booths`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: form.get("code"),
        size: form.get("size"),
        gridX: Number(form.get("gridX")),
        gridY: Number(form.get("gridY")),
        gridW: Number(form.get("gridW")),
        gridH: Number(form.get("gridH")),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) setNotice(data.error || "Could not add booth");
    else {
      (e.target as HTMLFormElement).reset();
      await load();
    }
  }

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
    if (res.ok) {
      setSelected(null);
      await load();
    }
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
        <div className="mb-4 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-sm px-4 py-3">
          {notice}
        </div>
      )}

      <FloorPlan
        features={features}
        booths={booths}
        sizeStyles={sizeStyles}
        allowAnyStatusClick
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
            Size {selected.size} · Current status {selected.status}
            {selected.occupant && ` · Occupied by ${selected.occupant.name}`}
          </p>

          <div className="grid sm:grid-cols-2 gap-3 text-sm">
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
          </div>

          <div className="mt-4 flex gap-3">
            <button
              onClick={() => {
                const status = (document.getElementById("booth-status-select") as HTMLSelectElement).value;
                const assignedApplicationId = (document.getElementById("booth-assign-select") as HTMLSelectElement).value;
                const manualAssigneeName = (document.getElementById("booth-manual-name") as HTMLInputElement).value;
                saveSelected({
                  status,
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

      <div className="mt-8 grid md:grid-cols-2 gap-6">
        <form onSubmit={addBooth} className="rounded-xl border border-brown/10 bg-cream-soft p-5">
          <p className="text-sm font-medium text-brown-dark mb-3">Add a single booth</p>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <input name="code" placeholder="Code e.g. A5" required className="border border-brown/20 rounded-lg px-2 py-1.5 bg-cream" />
            <select name="size" required className="border border-brown/20 rounded-lg px-2 py-1.5 bg-cream">
              {tiers.map((t) => (
                <option key={t.sizeKey} value={t.sizeKey}>
                  {t.sizeKey}
                </option>
              ))}
            </select>
            <input name="gridX" type="number" step="0.1" placeholder="X" required className="border border-brown/20 rounded-lg px-2 py-1.5 bg-cream" />
            <input name="gridY" type="number" step="0.1" placeholder="Y" required className="border border-brown/20 rounded-lg px-2 py-1.5 bg-cream" />
            <input name="gridW" type="number" step="0.1" placeholder="Width (cells)" required className="border border-brown/20 rounded-lg px-2 py-1.5 bg-cream" />
            <input name="gridH" type="number" step="0.1" placeholder="Height (cells)" required className="border border-brown/20 rounded-lg px-2 py-1.5 bg-cream" />
          </div>
          <button type="submit" className="mt-3 px-4 py-2 rounded-full bg-brown text-cream-soft text-sm">
            Add booth
          </button>
        </form>

        <form onSubmit={addFeature} className="rounded-xl border border-brown/10 bg-cream-soft p-5">
          <p className="text-sm font-medium text-brown-dark mb-3">Add a structural feature</p>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <select name="type" className="border border-brown/20 rounded-lg px-2 py-1.5 bg-cream col-span-2">
              {FEATURE_TYPE.map((t) => (
                <option key={t} value={t}>
                  {t.replaceAll("_", " ")}
                </option>
              ))}
            </select>
            <input name="label" placeholder="Label" required className="border border-brown/20 rounded-lg px-2 py-1.5 bg-cream col-span-2" />
            <input name="gridX" type="number" step="0.1" placeholder="X" required className="border border-brown/20 rounded-lg px-2 py-1.5 bg-cream" />
            <input name="gridY" type="number" step="0.1" placeholder="Y" required className="border border-brown/20 rounded-lg px-2 py-1.5 bg-cream" />
            <input name="gridW" type="number" step="0.1" placeholder="Width" required className="border border-brown/20 rounded-lg px-2 py-1.5 bg-cream" />
            <input name="gridH" type="number" step="0.1" placeholder="Height" required className="border border-brown/20 rounded-lg px-2 py-1.5 bg-cream" />
            <input name="rotation" type="number" placeholder="Rotation °" className="border border-brown/20 rounded-lg px-2 py-1.5 bg-cream col-span-2" />
          </div>
          <button type="submit" className="mt-3 px-4 py-2 rounded-full bg-brown text-cream-soft text-sm">
            Add feature
          </button>
        </form>
      </div>

      <div className="mt-6 rounded-xl border border-brown/10 bg-cream-soft p-5">
        <p className="text-sm font-medium text-brown-dark mb-2">Bulk import booths (paste JSON)</p>
        <p className="text-xs text-brown-light mb-3">
          {'Array of {"code","size","gridX","gridY","gridW","gridH"} — paste the full real booth list here once confirmed. Existing codes are updated in place; new codes are created as available.'}
        </p>
        <textarea
          value={bulkText}
          onChange={(e) => setBulkText(e.target.value)}
          rows={6}
          placeholder='[{"code":"A1","size":"2x2","gridX":0,"gridY":0,"gridW":2,"gridH":2}]'
          className="w-full border border-brown/20 rounded-lg px-3 py-2 bg-cream text-xs font-mono"
        />
        <button onClick={submitBulk} className="mt-3 px-4 py-2 rounded-full bg-brown text-cream-soft text-sm">
          Import
        </button>
      </div>
    </div>
  );
}
