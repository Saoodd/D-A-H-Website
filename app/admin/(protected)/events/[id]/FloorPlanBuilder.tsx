"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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

interface UndoEntry {
  label: string;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
}

const SMART_GUIDES_KEY = "dah_floorplan_smart_guides";
const GRID_SNAP_KEY = "dah_floorplan_grid_snap";

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

export function FloorPlanBuilder({
  eventId,
  tiers,
  floorPlanImageUrl: initialFloorPlanImageUrl,
  venueWidthM,
}: {
  eventId: string;
  tiers: Tier[];
  floorPlanImageUrl: string | null;
  venueWidthM: number | null;
}) {
  const [features, setFeatures] = useState<FloorFeature[]>([]);
  const [booths, setBooths] = useState<AdminBooth[]>([]);
  const [acceptedApplications, setAcceptedApplications] = useState<{ id: string; businessName: string }[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState<string | null>(null);
  const [bulkText, setBulkText] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [floorPlanImageUrl, setFloorPlanImageUrl] = useState(initialFloorPlanImageUrl);
  const [uploadingImage, setUploadingImage] = useState(false);

  const [placementOn, setPlacementOn] = useState(false);
  const [placeName, setPlaceName] = useState("");
  const [placePrice, setPlacePrice] = useState("");
  const [placeColor, setPlaceColor] = useState("#C97C4B");

  const [selectionPrice, setSelectionPrice] = useState("");
  const [applyingSelectionPrice, setApplyingSelectionPrice] = useState(false);
  const [busyAction, setBusyAction] = useState(false);

  const [smartGuidesEnabled, setSmartGuidesEnabled] = useState(true);
  const [gridSnapEnabled, setGridSnapEnabled] = useState(false);

  const [undoStack, setUndoStack] = useState<UndoEntry[]>([]);
  const [redoStack, setRedoStack] = useState<UndoEntry[]>([]);
  const undoRef = useRef(undoStack);
  const redoRef = useRef(redoStack);
  useEffect(() => {
    undoRef.current = undoStack;
    redoRef.current = redoStack;
  }, [undoStack, redoStack]);

  useEffect(() => {
    try {
      const g = window.localStorage.getItem(SMART_GUIDES_KEY);
      const s = window.localStorage.getItem(GRID_SNAP_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time sync from localStorage after mount
      if (g != null) setSmartGuidesEnabled(g === "1");
      if (s != null) setGridSnapEnabled(s === "1");
    } catch {
      // localStorage unavailable — keep defaults
    }
  }, []);

  function toggleSmartGuides() {
    setSmartGuidesEnabled((v) => {
      const next = !v;
      try {
        window.localStorage.setItem(SMART_GUIDES_KEY, next ? "1" : "0");
      } catch {
        // ignore
      }
      return next;
    });
  }

  function toggleGridSnap() {
    setGridSnapEnabled((v) => {
      const next = !v;
      try {
        window.localStorage.setItem(GRID_SNAP_KEY, next ? "1" : "0");
      } catch {
        // ignore
      }
      return next;
    });
  }

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

  function pushUndo(entry: UndoEntry) {
    setUndoStack((prev) => [...prev, entry]);
    setRedoStack([]);
  }

  async function handleUndo() {
    const entry = undoRef.current[undoRef.current.length - 1];
    if (!entry) return;
    setUndoStack((prev) => prev.slice(0, -1));
    await entry.undo();
    setRedoStack((prev) => [...prev, entry]);
    await load();
  }

  async function handleRedo() {
    const entry = redoRef.current[redoRef.current.length - 1];
    if (!entry) return;
    setRedoStack((prev) => prev.slice(0, -1));
    await entry.redo();
    setUndoStack((prev) => [...prev, entry]);
    await load();
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (isTypingTarget(e.target)) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) handleRedo();
        else handleUndo();
      } else if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        handleRedo();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handleUndo/handleRedo read live state via refs
  }, []);

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

  // Optimistic local update + PATCH for one booth, with no undo bookkeeping
  // of its own — callers that want undo wrap this and record before/after.
  const patchBoothRaw = useCallback(async (id: string, patch: Record<string, unknown>) => {
    setBooths((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)));
    await fetch(`/api/admin/booths/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
  }, []);

  // Single-booth move/resize/rotate, from dragging the solo-selected booth's
  // body or its corner/rotate handles.
  const onBoothCommit = useCallback(
    async (id: string, patch: Record<string, number>) => {
      const before = booths.find((b) => b.id === id);
      if (!before) return;
      const beforePatch: Record<string, number> = {};
      (Object.keys(patch) as (keyof AdminBooth)[]).forEach((k) => {
        beforePatch[k] = (before[k] as number) ?? 0;
      });
      await patchBoothRaw(id, patch);
      pushUndo({ label: "Move booth", undo: () => patchBoothRaw(id, beforePatch), redo: () => patchBoothRaw(id, patch) });
    },
    [booths, patchBoothRaw]
  );

  // Group move (drag or arrow-key nudge) and, since they build patches the
  // same shape, also used directly by Align/Distribute below.
  const onGroupCommit = useCallback(
    async (patches: { id: string; gridX: number; gridY: number }[]) => {
      if (patches.length === 0) return;
      const before = patches.map((p) => {
        const b = booths.find((bb) => bb.id === p.id);
        return { id: p.id, gridX: b?.gridX ?? 0, gridY: b?.gridY ?? 0 };
      });
      await Promise.all(patches.map((p) => patchBoothRaw(p.id, { gridX: p.gridX, gridY: p.gridY })));
      pushUndo({
        label: "Move selection",
        undo: async () => {
          await Promise.all(before.map((p) => patchBoothRaw(p.id, { gridX: p.gridX, gridY: p.gridY })));
        },
        redo: async () => {
          await Promise.all(patches.map((p) => patchBoothRaw(p.id, { gridX: p.gridX, gridY: p.gridY })));
        },
      });
    },
    [booths, patchBoothRaw]
  );

  function selectionMembers(): AdminBooth[] {
    return booths.filter((b) => selectedIds.has(b.id));
  }

  function alignSelection(kind: "left" | "right" | "top" | "bottom" | "centerH" | "centerV") {
    const members = selectionMembers();
    if (members.length < 2) return;
    const minX = Math.min(...members.map((b) => b.gridX));
    const maxX = Math.max(...members.map((b) => b.gridX + b.gridW));
    const minY = Math.min(...members.map((b) => b.gridY));
    const maxY = Math.max(...members.map((b) => b.gridY + b.gridH));
    const midX = (minX + maxX) / 2;
    const midY = (minY + maxY) / 2;
    const patches = members.map((b) => {
      let gridX = b.gridX;
      let gridY = b.gridY;
      if (kind === "left") gridX = minX;
      else if (kind === "right") gridX = maxX - b.gridW;
      else if (kind === "top") gridY = minY;
      else if (kind === "bottom") gridY = maxY - b.gridH;
      else if (kind === "centerH") gridY = midY - b.gridH / 2;
      else if (kind === "centerV") gridX = midX - b.gridW / 2;
      return { id: b.id, gridX, gridY };
    });
    onGroupCommit(patches);
  }

  function distributeSelection(axis: "horizontal" | "vertical") {
    const members = selectionMembers();
    if (members.length < 3) return;
    if (axis === "horizontal") {
      const sorted = [...members].sort((a, b) => a.gridX - b.gridX);
      const first = sorted[0];
      const last = sorted[sorted.length - 1];
      const span = last.gridX + last.gridW - first.gridX;
      const sumW = sorted.reduce((s, b) => s + b.gridW, 0);
      const gap = (span - sumW) / (sorted.length - 1);
      let cursor = first.gridX;
      const patches = sorted.map((b, i) => {
        if (i === 0) {
          cursor = b.gridX + b.gridW + gap;
          return { id: b.id, gridX: b.gridX, gridY: b.gridY };
        }
        const gridX = cursor;
        cursor = gridX + b.gridW + gap;
        return { id: b.id, gridX, gridY: b.gridY };
      });
      onGroupCommit(patches);
    } else {
      const sorted = [...members].sort((a, b) => a.gridY - b.gridY);
      const first = sorted[0];
      const last = sorted[sorted.length - 1];
      const span = last.gridY + last.gridH - first.gridY;
      const sumH = sorted.reduce((s, b) => s + b.gridH, 0);
      const gap = (span - sumH) / (sorted.length - 1);
      let cursor = first.gridY;
      const patches = sorted.map((b, i) => {
        if (i === 0) {
          cursor = b.gridY + b.gridH + gap;
          return { id: b.id, gridX: b.gridX, gridY: b.gridY };
        }
        const gridY = cursor;
        cursor = gridY + b.gridH + gap;
        return { id: b.id, gridX: b.gridX, gridY };
      });
      onGroupCommit(patches);
    }
  }

  // Plain function (not useCallback) so its `redo` closure can call itself
  // by name — a self-referencing useCallback trips up the hooks linter.
  async function createDuplicates(snapshot: AdminBooth[]) {
    const existingCodes = new Set(booths.map((b) => b.code));
    function nextCode(base: string) {
      let candidate = `${base}-copy`;
      let n = 2;
      while (existingCodes.has(candidate)) {
        candidate = `${base}-copy${n}`;
        n++;
      }
      existingCodes.add(candidate);
      return candidate;
    }
    const codeMap = snapshot.map((b) => ({ source: b, newCode: nextCode(b.code) }));
    await Promise.all(
      codeMap.map(({ source, newCode }) =>
        fetch(`/api/admin/events/${eventId}/booths`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            code: newCode,
            size: source.size,
            priceAedFils: source.priceAedFils,
            colorHex: source.colorHex,
            gridX: Math.min(100 - source.gridW, source.gridX + 3),
            gridY: Math.min(100 - source.gridH, source.gridY + 3),
            gridW: source.gridW,
            gridH: source.gridH,
            rotation: source.rotation ?? 0,
          }),
        })
      )
    );
    const newCodes = codeMap.map((c) => c.newCode);
    await load();
    pushUndo({
      label: "Duplicate",
      undo: async () => {
        const res = await fetch(`/api/admin/events/${eventId}/floorplan`);
        const data = await res.json().catch(() => ({ booths: [] as AdminBooth[] }));
        const toDelete = (data.booths as AdminBooth[]).filter((b) => newCodes.includes(b.code));
        await Promise.all(toDelete.map((b) => fetch(`/api/admin/booths/${b.id}`, { method: "DELETE" })));
        await load();
      },
      redo: async () => {
        await createDuplicates(snapshot);
      },
    });
  }

  async function duplicateSelection() {
    const members = selectionMembers();
    if (members.length === 0) return;
    setBusyAction(true);
    try {
      await createDuplicates(members.map((b) => ({ ...b })));
      setSelectedIds(new Set());
    } finally {
      setBusyAction(false);
    }
  }

  async function deleteSelection() {
    const members = selectionMembers();
    if (members.length === 0) return;
    if (!confirm(`Delete ${members.length} booth${members.length === 1 ? "" : "s"}?`)) return;
    setBusyAction(true);
    try {
      const snapshot = members.map((b) => ({ ...b }));
      await Promise.all(members.map((b) => fetch(`/api/admin/booths/${b.id}`, { method: "DELETE" })));
      setSelectedIds(new Set());
      await load();
      pushUndo({
        label: "Delete",
        undo: async () => {
          await Promise.all(
            snapshot.map((b) =>
              fetch(`/api/admin/events/${eventId}/booths`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  code: b.code,
                  size: b.size,
                  priceAedFils: b.priceAedFils,
                  colorHex: b.colorHex,
                  gridX: b.gridX,
                  gridY: b.gridY,
                  gridW: b.gridW,
                  gridH: b.gridH,
                  rotation: b.rotation ?? 0,
                }),
              })
            )
          );
          await load();
        },
        redo: async () => {
          const res = await fetch(`/api/admin/events/${eventId}/floorplan`);
          const data = await res.json().catch(() => ({ booths: [] as AdminBooth[] }));
          const toDelete = (data.booths as AdminBooth[]).filter((b) => snapshot.some((s) => s.code === b.code));
          await Promise.all(toDelete.map((b) => fetch(`/api/admin/booths/${b.id}`, { method: "DELETE" })));
          await load();
        },
      });
    } finally {
      setBusyAction(false);
    }
  }

  async function applySelectionPrice() {
    if (selectedIds.size === 0 || !selectionPrice.trim()) return;
    const members = selectionMembers();
    const before = members.map((b) => ({ id: b.id, priceAedFils: b.priceAedFils }));
    setApplyingSelectionPrice(true);
    try {
      const priceAedFils = Math.round(Number(selectionPrice) * 100);
      const res = await fetch(`/api/admin/events/${eventId}/booths/bulk-price`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ boothIds: Array.from(selectedIds), priceAedFils }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNotice(data.error || "Could not update those booths");
        return;
      }
      setNotice(`Updated the price on ${data.updated} booth${data.updated === 1 ? "" : "s"}.`);
      setSelectionPrice("");
      await load();
      pushUndo({
        label: "Bulk price",
        undo: async () => {
          await Promise.all(before.map((b) => patchBoothRaw(b.id, { priceAedFils: b.priceAedFils })));
        },
        redo: async () => {
          await Promise.all(Array.from(selectedIds).map((id) => patchBoothRaw(id, { priceAedFils })));
        },
      });
    } finally {
      setApplyingSelectionPrice(false);
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
    const selected = selectedIds.size === 1 ? booths.find((b) => selectedIds.has(b.id)) : null;
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
    setSelectedIds(new Set());
    await load();
  }

  async function deleteSelected() {
    const selected = selectedIds.size === 1 ? booths.find((b) => selectedIds.has(b.id)) : null;
    if (!selected) return;
    if (!confirm(`Delete booth ${selected.code}?`)) return;
    await fetch(`/api/admin/booths/${selected.id}`, { method: "DELETE" });
    setSelectedIds(new Set());
    await load();
  }

  const selected = selectedIds.size === 1 ? booths.find((b) => selectedIds.has(b.id)) ?? null : null;
  const selectionCount = selectedIds.size;

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

      <div className="mb-2 flex flex-wrap items-center gap-4 text-xs text-brown-light">
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input type="checkbox" checked={smartGuidesEnabled} onChange={toggleSmartGuides} />
          Smart guides (align &amp; equal spacing)
        </label>
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input type="checkbox" checked={gridSnapEnabled} onChange={toggleGridSnap} />
          Snap to grid
        </label>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={handleUndo}
            disabled={undoStack.length === 0}
            title="Undo (Cmd/Ctrl+Z)"
            className="w-7 h-7 rounded-full border border-brown/30 hover:bg-brown/10 disabled:opacity-30"
          >
            ↶
          </button>
          <button
            type="button"
            onClick={handleRedo}
            disabled={redoStack.length === 0}
            title="Redo (Cmd/Ctrl+Shift+Z)"
            className="w-7 h-7 rounded-full border border-brown/30 hover:bg-brown/10 disabled:opacity-30"
          >
            ↷
          </button>
        </div>
        {!venueWidthM && (
          <span className="text-brown-light/70 basis-full">
            Tip: set a real venue width (meters) in the event details above to show real distances while dragging.
          </span>
        )}
      </div>

      {selectionCount > 1 && (
        <div className="mb-4 rounded-xl border border-blue-300 bg-blue-50 p-4 sticky top-2 z-10 space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium text-blue-900">{selectionCount} booths selected</span>
            <button type="button" onClick={() => setSelectedIds(new Set())} className="text-xs text-blue-900 underline">
              Clear selection
            </button>
            <span className="text-xs text-blue-800/70 ml-auto">
              Drag any selected booth to move the group · arrow keys nudge · Cmd/Ctrl+D duplicates · Delete removes
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-blue-900">Align:</span>
            {(
              [
                ["left", "Left"],
                ["right", "Right"],
                ["top", "Top"],
                ["bottom", "Bottom"],
                ["centerH", "Center H"],
                ["centerV", "Center V"],
              ] as const
            ).map(([kind, label]) => (
              <button
                key={kind}
                type="button"
                onClick={() => alignSelection(kind)}
                className="px-3 py-1.5 rounded-full border border-blue-300 bg-white text-xs text-blue-900 hover:bg-blue-100"
              >
                {label}
              </button>
            ))}
            <span className="text-xs text-blue-900 ml-2">Distribute:</span>
            <button
              type="button"
              onClick={() => distributeSelection("horizontal")}
              disabled={selectionCount < 3}
              className="px-3 py-1.5 rounded-full border border-blue-300 bg-white text-xs text-blue-900 hover:bg-blue-100 disabled:opacity-40"
            >
              Horizontally
            </button>
            <button
              type="button"
              onClick={() => distributeSelection("vertical")}
              disabled={selectionCount < 3}
              className="px-3 py-1.5 rounded-full border border-blue-300 bg-white text-xs text-blue-900 hover:bg-blue-100 disabled:opacity-40"
            >
              Vertically
            </button>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-xs text-blue-900">
              New price (AED) for all selected
              <input
                value={selectionPrice}
                onChange={(e) => setSelectionPrice(e.target.value)}
                type="number"
                step="0.01"
                min="0"
                placeholder="1837.5"
                className="border border-blue-300 rounded-lg px-2 py-1.5 bg-white text-sm w-32"
              />
            </label>
            <button
              type="button"
              onClick={applySelectionPrice}
              disabled={applyingSelectionPrice || !selectionPrice.trim()}
              className="px-4 py-2 rounded-full bg-blue-700 text-white text-sm disabled:opacity-50"
            >
              {applyingSelectionPrice ? "Applying…" : "Apply price"}
            </button>
            <button
              type="button"
              onClick={duplicateSelection}
              disabled={busyAction}
              className="px-4 py-2 rounded-full border border-blue-300 bg-white text-sm text-blue-900 disabled:opacity-50"
            >
              Duplicate
            </button>
            <button
              type="button"
              onClick={deleteSelection}
              disabled={busyAction}
              className="px-4 py-2 rounded-full border border-red-300 text-red-700 text-sm disabled:opacity-50"
            >
              Delete selected
            </button>
          </div>
        </div>
      )}

      <FloorPlan
        features={features}
        booths={booths}
        sizeStyles={sizeStyles}
        allowAnyStatusClick
        backgroundImageUrl={floorPlanImageUrl}
        placementMode={placementOn}
        onCanvasClick={handleCanvasClick}
        onDeselect={() => setSelectedIds(new Set())}
        editable={!placementOn}
        onBoothCommit={onBoothCommit}
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
        onGroupCommit={onGroupCommit}
        onDeleteSelected={deleteSelection}
        onDuplicateSelected={duplicateSelection}
        smartGuidesEnabled={smartGuidesEnabled}
        gridSnapEnabled={gridSnapEnabled}
        venueWidthM={venueWidthM}
      />
      <Legend sizeStyles={sizeStyles} />

      {selected && (
        <div className="mt-4 rounded-xl border border-brown/20 bg-cream p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="font-heading text-lg text-brown-dark">Booth {selected.code}</p>
            <button onClick={() => setSelectedIds(new Set())} className="text-xs text-brown-light underline">
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
