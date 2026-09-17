"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FloorPlan } from "@/components/floorplan/FloorPlan";
import { Legend } from "@/components/floorplan/Legend";
import type { FloorBooth, FloorFeature, SizeStyle } from "@/components/floorplan/types";
import { FEATURE_TYPE, formatAed } from "@/lib/constants";
import { CadImportPanel } from "@/components/admin/CadImportPanel";
import { VenueBoundaryEditor } from "@/components/admin/VenueBoundaryEditor";
import { BackgroundAlignmentEditor } from "@/components/admin/BackgroundAlignmentEditor";
import { getFloorplanViewBox, mmToGridRect, worldRectOf, worldPatchToServerPatch } from "@/lib/floorplan/transform";

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
  venueWidthMm: initialVenueWidthMm,
  venueDepthMm: initialVenueDepthMm,
  venueScaleConfirmed: initialVenueScaleConfirmed,
  venueShape: initialVenueShape,
  venueBoundaryJson: initialVenueBoundaryJson,
  venueBackgroundNaturalWidthPx: initialVenueBackgroundNaturalWidthPx,
  venueBackgroundNaturalHeightPx: initialVenueBackgroundNaturalHeightPx,
  venueBackgroundOffsetXMm: initialVenueBackgroundOffsetXMm,
  venueBackgroundOffsetYMm: initialVenueBackgroundOffsetYMm,
  venueBackgroundScale: initialVenueBackgroundScale,
  venueBackgroundRotationDeg: initialVenueBackgroundRotationDeg,
  venueBackgroundLocked: initialVenueBackgroundLocked,
}: {
  eventId: string;
  tiers: Tier[];
  floorPlanImageUrl: string | null;
  venueWidthM: number | null;
  venueWidthMm?: number | null;
  venueDepthMm?: number | null;
  venueScaleConfirmed?: boolean;
  venueShape?: string;
  venueBoundaryJson?: string | null;
  venueBackgroundNaturalWidthPx?: number | null;
  venueBackgroundNaturalHeightPx?: number | null;
  venueBackgroundOffsetXMm?: number | null;
  venueBackgroundOffsetYMm?: number | null;
  venueBackgroundScale?: number | null;
  venueBackgroundRotationDeg?: number;
  venueBackgroundLocked?: boolean;
}) {
  const [features, setFeatures] = useState<FloorFeature[]>([]);
  const [selectedFeatureId, setSelectedFeatureId] = useState<string | null>(null);
  const [featureBusy, setFeatureBusy] = useState(false);
  const [booths, setBooths] = useState<AdminBooth[]>([]);
  const [acceptedApplications, setAcceptedApplications] = useState<{ id: string; businessName: string }[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState<string | null>(null);
  const [bulkText, setBulkText] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [floorPlanImageUrl, setFloorPlanImageUrl] = useState(initialFloorPlanImageUrl);
  const [uploadingImage, setUploadingImage] = useState(false);

  // Physical Scale (Floor Plan Setup Wizard step 2) — the authoritative
  // real-world venue size. Once confirmed, the canvas below renders in true
  // millimetres (viewBox = venueWidthMm x venueDepthMm) instead of the
  // legacy 0-100 percentage square, and every geometry-writing server route
  // (create/PATCH/Mass Create/bulk size) derives rendered size from real
  // widthMm/depthMm instead of a fixed default box — see
  // lib/floorplan/transform.ts. Until confirmed, everything below behaves
  // exactly as it always has.
  const [venueWidthMmState, setVenueWidthMmState] = useState(initialVenueWidthMm ?? null);
  const [venueDepthMmState, setVenueDepthMmState] = useState(initialVenueDepthMm ?? null);
  const [venueScaleConfirmedState, setVenueScaleConfirmedState] = useState(initialVenueScaleConfirmed ?? false);
  const [scaleFormOpen, setScaleFormOpen] = useState(false);
  const [scaleWidthInput, setScaleWidthInput] = useState(initialVenueWidthMm ? String(initialVenueWidthMm / 1000) : "");
  const [scaleDepthInput, setScaleDepthInput] = useState(initialVenueDepthMm ? String(initialVenueDepthMm / 1000) : "");
  const [scaleBusy, setScaleBusy] = useState(false);

  // Venue Boundary (Floor Plan Setup Wizard step 3) — see
  // components/admin/VenueBoundaryEditor.tsx and lib/floorplan/boundary.ts.
  const [venueShapeState, setVenueShapeState] = useState(initialVenueShape ?? "RECTANGLE");
  const [venueBoundaryJsonState, setVenueBoundaryJsonState] = useState(initialVenueBoundaryJson ?? null);
  const [boundaryEditorOpen, setBoundaryEditorOpen] = useState(false);

  // Background Alignment (Floor Plan Setup Wizard step 4) — see
  // components/admin/BackgroundAlignmentEditor.tsx and computeBackgroundRect
  // in lib/floorplan/transform.ts.
  const [bgNaturalWidthPx, setBgNaturalWidthPx] = useState(initialVenueBackgroundNaturalWidthPx ?? null);
  const [bgNaturalHeightPx, setBgNaturalHeightPx] = useState(initialVenueBackgroundNaturalHeightPx ?? null);
  const [bgOffsetXMm, setBgOffsetXMm] = useState(initialVenueBackgroundOffsetXMm ?? null);
  const [bgOffsetYMm, setBgOffsetYMm] = useState(initialVenueBackgroundOffsetYMm ?? null);
  const [bgScale, setBgScale] = useState(initialVenueBackgroundScale ?? null);
  const [bgRotationDeg, setBgRotationDeg] = useState(initialVenueBackgroundRotationDeg ?? 0);
  const [bgLocked, setBgLocked] = useState(initialVenueBackgroundLocked ?? false);
  const [backgroundEditorOpen, setBackgroundEditorOpen] = useState(false);

  // Floor Plan Setup Wizard shell: sequences the steps above (Source,
  // Physical Scale, Venue Boundary, Background Alignment, Booths) plus a
  // Review step, instead of leaving an admin to discover the toolbar
  // controls unprompted. It drives the SAME state/handlers as the toolbar
  // (scaleWidthInput/saveScale, boundaryEditorOpen, backgroundEditorOpen,
  // uploadFloorPlanImage) rather than duplicating any logic — it's a guided
  // front door onto the existing panels, not a second implementation of
  // them. Auto-opens for any event that hasn't confirmed its physical scale
  // yet (the one step the publish gate actually enforces server-side, see
  // PATCH /api/admin/events/[id]); always reachable afterward via the
  // "Setup Wizard" link in the toolbar for revisiting/adjusting.
  const WIZARD_STEPS = ["Source", "Physical Scale", "Venue Boundary", "Background", "Booths", "Review"] as const;
  const [wizardOpen, setWizardOpen] = useState(!initialVenueScaleConfirmed);
  const [wizardStep, setWizardStep] = useState(0);

  const viewBox = getFloorplanViewBox({
    venueScaleConfirmed: venueScaleConfirmedState,
    venueWidthMm: venueWidthMmState,
    venueDepthMm: venueDepthMmState,
  });
  const coordinateMode = viewBox.mode;
  const venueSize = { venueWidthMm: venueWidthMmState ?? 0, venueDepthMm: venueDepthMmState ?? 0 };

  // `booths`/`features` state ALWAYS holds the server's own representation
  // (gridX/Y/W/H as 0-100 percentages, xMm/yMm/widthMm/depthMm as real mm —
  // see mmToGridRect in lib/floorplan/transform.ts) untouched, so every
  // other reader of that state (CSV export, price displays, undo
  // snapshots, ...) keeps working exactly as before. displayBooths/
  // displayFeatures are the SAME items with gridX/Y/W/H resolved into
  // CURRENT VIEWBOX UNITS (still percent in legacy mode; real mm once
  // scale is confirmed) via worldRectOf — the one thing the canvas render
  // and all geometry MATH (align/distribute/duplicate/click-to-place/drag/
  // resize) below should ever read positions from. Writing back to the
  // server always goes through worldPatchToServerPatch so a raw mm number
  // is never sent under the name "gridX", which the server always treats
  // as a percentage regardless of mode.
  const displayBooths = useMemo(
    () => booths.map((b) => ({ ...b, ...(() => { const r = worldRectOf(b, coordinateMode, venueSize); return { gridX: r.x, gridY: r.y, gridW: r.w, gridH: r.h }; })() })),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- venueSize is a fresh object literal every render; depending on its primitive fields (already listed) is equivalent and avoids invalidating this memo every render
    [booths, coordinateMode, venueSize.venueWidthMm, venueSize.venueDepthMm]
  );
  const displayFeatures = useMemo(
    () => features.map((f) => ({ ...f, ...(() => { const r = worldRectOf(f, coordinateMode, venueSize); return { gridX: r.x, gridY: r.y, gridW: r.w, gridH: r.h }; })() })),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- venueSize is a fresh object literal every render; depending on its primitive fields (already listed) is equivalent and avoids invalidating this memo every render
    [features, coordinateMode, venueSize.venueWidthMm, venueSize.venueDepthMm]
  );

  async function saveScale(confirmed: boolean) {
    const widthM = Number(scaleWidthInput);
    const depthM = Number(scaleDepthInput);
    if (confirmed && (!widthM || widthM <= 0 || !depthM || depthM <= 0)) {
      setNotice("Enter a valid venue width and depth in meters before confirming.");
      return;
    }
    setScaleBusy(true);
    try {
      const widthMm = widthM > 0 ? Math.round(widthM * 1000) : null;
      const depthMm = depthM > 0 ? Math.round(depthM * 1000) : null;
      const res = await fetch(`/api/admin/events/${eventId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ venueWidthMm: widthMm, venueDepthMm: depthMm, venueScaleConfirmed: confirmed }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setNotice(j.error || "Couldn't save the physical scale.");
        return;
      }
      setVenueWidthMmState(widthMm);
      setVenueDepthMmState(depthMm);
      setVenueScaleConfirmedState(confirmed);
      setScaleFormOpen(false);
      setNotice(confirmed ? "Physical scale confirmed — booths now render at their true size." : "Physical scale saved as draft (not yet confirmed).");
    } finally {
      setScaleBusy(false);
    }
  }

  const [placementOn, setPlacementOn] = useState(false);
  const [placeName, setPlaceName] = useState("");
  const [placePrice, setPlacePrice] = useState("");
  const [placeColor, setPlaceColor] = useState("#C97C4B");
  const [placeWidthM, setPlaceWidthM] = useState("");
  const [placeDepthM, setPlaceDepthM] = useState("");

  const [selectionPrice, setSelectionPrice] = useState("");
  const [selectionWidthM, setSelectionWidthM] = useState("");
  const [selectionDepthM, setSelectionDepthM] = useState("");
  const [selectionTierKey, setSelectionTierKey] = useState("");
  const [selectionStatus, setSelectionStatus] = useState<"" | "AVAILABLE" | "RESERVED">("");
  const [applyingSelectionPrice, setApplyingSelectionPrice] = useState(false);
  const [busyAction, setBusyAction] = useState(false);

  const [autoNumberOpen, setAutoNumberOpen] = useState(false);
  const [autoNumberPrefix, setAutoNumberPrefix] = useState("B");
  const [autoNumberStart, setAutoNumberStart] = useState("1");
  const [autoNumberPadding, setAutoNumberPadding] = useState<"none" | "2" | "3">("none");
  const [autoNumberOrder, setAutoNumberOrder] = useState<"row" | "column">("row");
  const [autoNumberBusy, setAutoNumberBusy] = useState(false);

  const [massCreateOpen, setMassCreateOpen] = useState(false);
  const [mcPrefix, setMcPrefix] = useState("B");
  const [mcStart, setMcStart] = useState("1");
  const [mcEnd, setMcEnd] = useState("10");
  const [mcPadding, setMcPadding] = useState<"none" | "2" | "3">("none");
  const [mcTier, setMcTier] = useState("");
  const [mcWidthM, setMcWidthM] = useState("2");
  const [mcDepthM, setMcDepthM] = useState("2");
  const [mcPrice, setMcPrice] = useState("");
  const [mcColor, setMcColor] = useState("#C97C4B");
  const [mcPlacement, setMcPlacement] = useState<"row" | "grid">("grid");
  const [mcColumns, setMcColumns] = useState("10");
  const [mcBusy, setMcBusy] = useState(false);

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

  // Auto-advance the wizard's mandatory Physical Scale step the moment
  // scale actually gets confirmed (via saveScale(true) below), whichever UI
  // triggered it — reactive on the state saveScale already sets, rather
  // than threading a success callback through it.
  useEffect(() => {
    if (wizardOpen && wizardStep === 1 && venueScaleConfirmedState) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reacting to scale confirmation to auto-advance the wizard step, not an initial sync
      setWizardStep(2);
    }
  }, [venueScaleConfirmedState, wizardOpen, wizardStep]);

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
      // `xPercent`/`yPercent` (despite the name, kept for minimal diff) are
      // FloorPlan.tsx's onCanvasClick coordinates in CURRENT VIEWBOX UNITS
      // — 0-100 percent in legacy mode, real millimetres once scale is
      // confirmed (see components/floorplan/FloorPlan.tsx pointToPercent).
      // In MM mode, the admin's typed width/depth (meters) size the
      // placeholder box directly and position it explicitly via xMm/yMm so
      // the CREATE route takes its authoritative path instead of
      // misreading a real mm coordinate as a 0-100 percentage; gridX/Y/W/H
      // are still sent (the route's own required-field check) but as the
      // server-derived values matching that same xMm/yMm/widthMm/depthMm.
      const res = await fetch(`/api/admin/events/${eventId}/booths`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          coordinateMode === "MM"
            ? (() => {
                const widthMm = placeWidthM.trim() ? Math.round(Number(placeWidthM) * 1000) : 1000;
                const depthMm = placeDepthM.trim() ? Math.round(Number(placeDepthM) * 1000) : 1000;
                const xMm = Math.min(viewBox.width - widthMm, Math.max(0, xPercent - widthMm / 2));
                const yMm = Math.min(viewBox.height - depthMm, Math.max(0, yPercent - depthMm / 2));
                return {
                  code: name,
                  size: "custom",
                  priceAedFils: placePrice ? Math.round(Number(placePrice) * 100) : null,
                  colorHex: placeColor || null,
                  widthMm,
                  depthMm,
                  xMm: Math.round(xMm),
                  yMm: Math.round(yMm),
                  ...mmToGridRect(venueSize, { xMm, yMm, widthMm, depthMm }),
                };
              })()
            : (() => {
                const w = DEFAULT_BOOTH_W;
                const h = DEFAULT_BOOTH_H;
                const gridX = Math.min(100 - w, Math.max(0, xPercent - w / 2));
                const gridY = Math.min(100 - h, Math.max(0, yPercent - h / 2));
                return {
                  code: name,
                  size: "custom",
                  priceAedFils: placePrice ? Math.round(Number(placePrice) * 100) : null,
                  colorHex: placeColor || null,
                  widthMm: placeWidthM.trim() ? Math.round(Number(placeWidthM) * 1000) : null,
                  depthMm: placeDepthM.trim() ? Math.round(Number(placeDepthM) * 1000) : null,
                  gridX,
                  gridY,
                  gridW: w,
                  gridH: h,
                };
              })()
        ),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setNotice(data.error || "Could not add booth");
      else {
        setPlaceName("");
        setPlaceWidthM("");
        setPlaceDepthM("");
        await load();
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- venueSize is a fresh object literal every render; depending on its primitive fields (already listed) is equivalent and avoids invalidating this callback every render
    [eventId, placeName, placePrice, placeColor, placeWidthM, placeDepthM, load, coordinateMode, viewBox.width, viewBox.height, venueSize.venueWidthMm, venueSize.venueDepthMm]
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
  // `worldPatch` is expressed in CURRENT VIEWBOX UNITS for any gridX/Y/W/H
  // keys it carries (percent in legacy mode, real mm once scale is
  // confirmed — exactly what FloorPlan.tsx's own drag/resize/rotate math
  // emits, and what align/distribute/duplicate/click-to-place below also
  // produce via displayBooths). Translated to the server's actual field
  // names (xMm/yMm/widthMm/depthMm in MM mode) via worldPatchToServerPatch
  // before either the optimistic state update or the PATCH body — `booths`
  // state must always stay in the server's own representation so it keeps
  // working for every other reader (CSV export, price displays, ...).
  // Non-geometry keys (price, color, status, rotation, ...) pass through
  // unchanged either way.
  const patchBoothRaw = useCallback(
    async (id: string, worldPatch: Record<string, unknown>) => {
      const serverPatch = worldPatchToServerPatch(worldPatch, coordinateMode);
      setBooths((prev) => prev.map((b) => (b.id === id ? { ...b, ...serverPatch } : b)));
      await fetch(`/api/admin/booths/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(serverPatch),
      });
    },
    [coordinateMode]
  );

  // Single-booth move/resize/rotate, from dragging the solo-selected booth's
  // body or its corner/rotate handles. `patch` arrives in CURRENT VIEWBOX
  // UNITS (see patchBoothRaw above) — the "before" snapshot must be read
  // from the SAME unit space (displayBooths), not the server-shaped
  // `booths` state, so undo/redo replay the exact values that were dragged
  // from/to rather than mixing units.
  const onBoothCommit = useCallback(
    async (id: string, patch: Record<string, number>) => {
      const before = displayBooths.find((b) => b.id === id);
      if (!before) return;
      const beforePatch: Record<string, number> = {};
      (Object.keys(patch) as (keyof AdminBooth)[]).forEach((k) => {
        beforePatch[k] = (before[k] as number) ?? 0;
      });
      await patchBoothRaw(id, patch);
      pushUndo({ label: "Move booth", undo: () => patchBoothRaw(id, beforePatch), redo: () => patchBoothRaw(id, patch) });
    },
    [displayBooths, patchBoothRaw]
  );

  // Feature move/rotate, from FloorPlan's per-feature drag/rotate handle —
  // same worldPatchToServerPatch translation as patchBoothRaw above (never
  // send a real mm value under the "gridX" key once scale is confirmed).
  const onFeatureCommit = useCallback(
    async (id: string, patch: Record<string, unknown>) => {
      const serverPatch = worldPatchToServerPatch(patch, coordinateMode);
      setFeatures((prev) => prev.map((f) => (f.id === id ? { ...f, ...serverPatch } : f)));
      await fetch(`/api/admin/features/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(serverPatch),
      });
    },
    [coordinateMode]
  );

  // Group move (drag or arrow-key nudge) and, since they build patches the
  // same shape, also used directly by Align/Distribute below. `patches`
  // arrive in CURRENT VIEWBOX UNITS, same as onBoothCommit above.
  const onGroupCommit = useCallback(
    async (patches: { id: string; gridX: number; gridY: number }[]) => {
      if (patches.length === 0) return;
      const before = patches.map((p) => {
        const b = displayBooths.find((bb) => bb.id === p.id);
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
    [displayBooths, patchBoothRaw]
  );

  // Reads from displayBooths (CURRENT VIEWBOX UNITS) — every caller
  // (align/distribute/duplicate) does its own geometry math on the result,
  // which must stay in the same unit space onGroupCommit/patchBoothRaw
  // expect their incoming patches in.
  function selectionMembers(): AdminBooth[] {
    return displayBooths.filter((b) => selectedIds.has(b.id));
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
    // `snapshot` items come from displayBooths (see duplicateSelection below)
    // — gridX/Y/W/H are already in CURRENT VIEWBOX UNITS. The nudge offset
    // (visually separating the copy from its source) scales with viewBox
    // size rather than a hardcoded "3", which meant 3mm — invisible — once
    // that was really millimetres instead of 3%.
    const nudge = viewBox.width * 0.03;
    await Promise.all(
      codeMap.map(({ source, newCode }) => {
        const gridX = Math.min(viewBox.width - source.gridW, source.gridX + nudge);
        const gridY = Math.min(viewBox.height - source.gridH, source.gridY + nudge);
        const base = { code: newCode, size: source.size, priceAedFils: source.priceAedFils, colorHex: source.colorHex, rotation: source.rotation ?? 0 };
        // The CREATE route requires valid gridX/Y/W/H numbers regardless of
        // mode (its own initial validation), but in MM mode also needs the
        // EXPLICIT xMm/yMm/widthMm/depthMm so it takes the authoritative
        // path instead of misreading gridX (now an mm value) as a percent
        // — see the same requirement documented on worldPatchToServerPatch.
        const body =
          coordinateMode === "MM"
            ? { ...base, widthMm: source.gridW, depthMm: source.gridH, xMm: Math.round(gridX), yMm: Math.round(gridY), ...mmToGridRect(venueSize, { xMm: gridX, yMm: gridY, widthMm: source.gridW, depthMm: source.gridH }) }
            : { ...base, gridX, gridY, gridW: source.gridW, gridH: source.gridH };
        return fetch(`/api/admin/events/${eventId}/booths`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      })
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
    if (!confirm(`Delete ${members.length} booth${members.length === 1 ? "" : "s"}? Booths with a confirmed booking or payment history are never deleted, even if selected.`)) return;
    setBusyAction(true);
    try {
      const requestedIds = members.map((b) => b.id);
      const res = await fetch(`/api/admin/events/${eventId}/booths/bulk-delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ boothIds: requestedIds }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNotice(data.error || "Could not delete those booths");
        return;
      }
      const skippedIds = new Set<string>((data.skippedDetails || []).map((s: { boothId: string }) => s.boothId));
      const deletedSnapshot = members.filter((b) => !skippedIds.has(b.id)).map((b) => ({ ...b }));
      let msg = `Deleted ${data.deleted} of ${data.requested} booth${data.requested === 1 ? "" : "s"}.`;
      if (data.skipped > 0) {
        const reasons = (data.skippedDetails || []).map((s: { code: string; reason: string }) => `${s.code} (${s.reason})`).join(", ");
        msg += ` ${data.skipped} skipped: ${reasons}.`;
      }
      setNotice(msg);
      setSelectedIds(new Set());
      await load();
      if (deletedSnapshot.length > 0) {
        pushUndo({
          label: "Delete",
          undo: async () => {
            // deletedSnapshot items come from displayBooths — gridX/Y/W/H
            // are already CURRENT VIEWBOX UNITS. In MM mode that means they
            // ARE the real mm position/size already, so pass them as
            // explicit xMm/yMm/widthMm/depthMm (the route's authoritative
            // path) rather than under the name gridX/Y/W/H, which it always
            // treats as a 0-100 percentage — see worldPatchToServerPatch.
            await Promise.all(
              deletedSnapshot.map((b) => {
                const body =
                  coordinateMode === "MM"
                    ? {
                        code: b.code,
                        size: b.size,
                        priceAedFils: b.priceAedFils,
                        colorHex: b.colorHex,
                        rotation: b.rotation ?? 0,
                        widthMm: b.gridW,
                        depthMm: b.gridH,
                        xMm: Math.round(b.gridX),
                        yMm: Math.round(b.gridY),
                        ...mmToGridRect(venueSize, { xMm: b.gridX, yMm: b.gridY, widthMm: b.gridW, depthMm: b.gridH }),
                      }
                    : {
                        code: b.code,
                        size: b.size,
                        priceAedFils: b.priceAedFils,
                        colorHex: b.colorHex,
                        widthMm: b.widthMm,
                        depthMm: b.depthMm,
                        gridX: b.gridX,
                        gridY: b.gridY,
                        gridW: b.gridW,
                        gridH: b.gridH,
                        rotation: b.rotation ?? 0,
                      };
                return fetch(`/api/admin/events/${eventId}/booths`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(body),
                });
              })
            );
          },
          redo: async () => {
            const res2 = await fetch(`/api/admin/events/${eventId}/floorplan`);
            const data2 = await res2.json().catch(() => ({ booths: [] as AdminBooth[] }));
            const toDelete = (data2.booths as AdminBooth[]).filter((b) => deletedSnapshot.some((s) => s.code === b.code));
            await fetch(`/api/admin/events/${eventId}/booths/bulk-delete`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ boothIds: toDelete.map((b) => b.id) }),
            });
          },
        });
      }
    } finally {
      setBusyAction(false);
    }
  }

  // Shared engine behind every "N booths selected" bulk field edit (price,
  // size, tier, status) — one transactional server call per action, undo
  // integration, and a notice summarizing what actually happened including
  // any skipped/protected booths. Only booths the server actually touched
  // are ever replayed by undo/redo's patchBoothRaw calls — a booth the
  // server skipped (e.g. a confirmed booking, protected from bulk status
  // changes) must never be included, since patchBoothRaw's underlying PATCH
  // route unconditionally clears any active hold on whatever it touches.
  async function runBulkEdit(patch: Record<string, unknown>, label: string, confirmText: string): Promise<boolean> {
    const requestedIds = Array.from(selectedIds);
    if (requestedIds.length === 0) return false;
    if (!confirm(confirmText)) return false;
    setBusyAction(true);
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/events/${eventId}/booths/bulk-edit`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ boothIds: requestedIds, patch }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNotice(data.error || "Could not update those booths");
        return false;
      }
      const skippedIds = new Set<string>((data.skippedDetails || []).map((s: { boothId: string }) => s.boothId));
      const updatedIds = requestedIds.filter((rid) => !skippedIds.has(rid));
      const fields = Object.keys(patch);
      const before = booths
        .filter((b) => updatedIds.includes(b.id))
        .map((b) => {
          const snap: Record<string, unknown> = { id: b.id };
          const record = b as unknown as Record<string, unknown>;
          fields.forEach((f) => {
            snap[f] = record[f] ?? null;
          });
          // Bulk tier-assignment implicitly clears priceAedFils server-side
          // (see bulk-edit route) unless price was also explicitly set —
          // snapshot it too so undo restores the exact prior override.
          if ("size" in patch && !("priceAedFils" in patch)) snap.priceAedFils = b.priceAedFils ?? null;
          return snap;
        });

      let msg = `${label}: updated ${data.updated} of ${data.requested} booth${data.requested === 1 ? "" : "s"}.`;
      if (data.skipped > 0) {
        const reasons = (data.skippedDetails || []).map((s: { code: string; reason: string }) => `${s.code} (${s.reason})`).join(", ");
        msg += ` ${data.skipped} skipped: ${reasons}.`;
      }
      setNotice(msg);
      await load();

      if (updatedIds.length > 0) {
        pushUndo({
          label,
          undo: async () => {
            await Promise.all(
              before.map((b) => patchBoothRaw(b.id as string, Object.fromEntries(Object.entries(b).filter(([k]) => k !== "id"))))
            );
          },
          redo: async () => {
            await fetch(`/api/admin/events/${eventId}/booths/bulk-edit`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ boothIds: updatedIds, patch }),
            });
          },
        });
      }
      return true;
    } finally {
      setBusyAction(false);
    }
  }

  async function applySelectionPrice() {
    if (!selectionPrice.trim()) return;
    const priceAedFils = Math.round(Number(selectionPrice) * 100);
    if (Number.isNaN(priceAedFils) || priceAedFils < 0) {
      setNotice("Invalid price.");
      return;
    }
    setApplyingSelectionPrice(true);
    try {
      const ok = await runBulkEdit(
        { priceAedFils },
        "Bulk price",
        `Apply AED ${selectionPrice} to ${selectionCountLabel()}?`
      );
      if (ok) setSelectionPrice("");
    } finally {
      setApplyingSelectionPrice(false);
    }
  }

  async function applySelectionSize() {
    if (!selectionWidthM.trim() || !selectionDepthM.trim()) return;
    const widthMm = Math.round(Number(selectionWidthM) * 1000);
    const depthMm = Math.round(Number(selectionDepthM) * 1000);
    if (Number.isNaN(widthMm) || widthMm <= 0 || Number.isNaN(depthMm) || depthMm <= 0) {
      setNotice("Invalid size.");
      return;
    }
    const ok = await runBulkEdit(
      { widthMm, depthMm },
      "Bulk size",
      `Apply ${selectionWidthM} × ${selectionDepthM} m to ${selectionCountLabel()}?`
    );
    if (ok) {
      setSelectionWidthM("");
      setSelectionDepthM("");
    }
  }

  async function applySelectionTier() {
    if (!selectionTierKey) return;
    const tier = tiers.find((t) => t.sizeKey === selectionTierKey);
    const ok = await runBulkEdit(
      { size: selectionTierKey },
      "Bulk tier",
      `Assign ${tier?.label ?? selectionTierKey} to ${selectionCountLabel()}? This clears any per-booth price override on those booths so the tier's price applies.`
    );
    if (ok) setSelectionTierKey("");
  }

  async function applySelectionStatus() {
    if (!selectionStatus) return;
    const ok = await runBulkEdit(
      { status: selectionStatus },
      "Bulk status",
      `Set ${selectionCountLabel()} to ${selectionStatus === "AVAILABLE" ? "Available" : "Reserved"}? Booths with a confirmed booking or an active vendor hold are skipped automatically.`
    );
    if (ok) setSelectionStatus("");
  }

  function selectionCountLabel() {
    return `${selectedIds.size} booth${selectedIds.size === 1 ? "" : "s"}`;
  }

  function padNumber(n: number, padding: "none" | "2" | "3") {
    if (padding === "none") return String(n);
    return String(n).padStart(padding === "2" ? 2 : 3, "0");
  }

  // Left→right-then-top→bottom (or the transposed top→bottom-then-left→
  // right) reading order for Auto Number Selected — buckets booths into
  // rows/columns by proximity (5% of canvas) rather than sorting purely by
  // one axis, so booths that are roughly level with each other land in the
  // same row/column even with small drag imprecision, instead of an order
  // that looks arbitrary.
  function orderedSelectionForAutoNumber(): AdminBooth[] {
    const members = selectionMembers();
    return [...members].sort((a, b) => {
      if (autoNumberOrder === "row") {
        const rowA = Math.round(a.gridY / 5);
        const rowB = Math.round(b.gridY / 5);
        if (rowA !== rowB) return rowA - rowB;
        return a.gridX - b.gridX;
      }
      const colA = Math.round(a.gridX / 5);
      const colB = Math.round(b.gridX / 5);
      if (colA !== colB) return colA - colB;
      return a.gridY - b.gridY;
    });
  }

  function autoNumberPreview(): { id: string; from: string; to: string }[] {
    const prefix = autoNumberPrefix.trim();
    const start = parseInt(autoNumberStart, 10);
    if (!prefix || Number.isNaN(start)) return [];
    return orderedSelectionForAutoNumber().map((b, i) => ({ id: b.id, from: b.code, to: `${prefix}${padNumber(start + i, autoNumberPadding)}` }));
  }

  async function applyAutoNumber() {
    const preview = autoNumberPreview();
    if (preview.length === 0) {
      setNotice("Enter a prefix and starting number.");
      return;
    }
    if (!confirm(`Rename ${preview.length} booths: ${preview[0].to} → ${preview[preview.length - 1].to}?`)) return;
    setAutoNumberBusy(true);
    try {
      const renames = preview.map((p) => ({ boothId: p.id, code: p.to }));
      const before = preview.map((p) => ({ boothId: p.id, code: p.from }));
      const res = await fetch(`/api/admin/events/${eventId}/booths/rename-batch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ renames }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNotice(data.error || "Could not auto-number those booths");
        return;
      }
      setNotice(`Renamed ${data.renamed} booth${data.renamed === 1 ? "" : "s"}.`);
      setAutoNumberOpen(false);
      await load();
      pushUndo({
        label: "Auto number",
        undo: async () => {
          await fetch(`/api/admin/events/${eventId}/booths/rename-batch`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ renames: before }),
          });
        },
        redo: async () => {
          await fetch(`/api/admin/events/${eventId}/booths/rename-batch`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ renames }),
          });
        },
      });
    } finally {
      setAutoNumberBusy(false);
    }
  }

  function mcGenerateCodes(): string[] {
    const start = parseInt(mcStart, 10);
    const end = parseInt(mcEnd, 10);
    const prefix = mcPrefix.trim();
    if (!prefix || Number.isNaN(start) || Number.isNaN(end) || end < start) return [];
    const codes: string[] = [];
    for (let n = start; n <= end; n++) codes.push(`${prefix}${padNumber(n, mcPadding)}`);
    return codes;
  }

  function mcGenerateRows(): { code: string; gridX: number; gridY: number; gridW: number; gridH: number }[] {
    const codes = mcGenerateCodes();
    const cols = mcPlacement === "row" ? Math.max(codes.length, 1) : Math.max(1, parseInt(mcColumns, 10) || 1);
    const cellW = 8;
    const cellH = 10;
    return codes.map((code, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      return {
        code,
        gridX: Math.min(100 - DEFAULT_BOOTH_W, col * cellW),
        gridY: Math.min(100 - DEFAULT_BOOTH_H, row * cellH),
        gridW: DEFAULT_BOOTH_W,
        gridH: DEFAULT_BOOTH_H,
      };
    });
  }

  async function submitMassCreate() {
    const rows = mcGenerateRows();
    if (rows.length === 0) {
      setNotice("Enter a valid prefix and number range.");
      return;
    }
    if (rows.length > 500) {
      setNotice("Mass create is limited to 500 booths at a time.");
      return;
    }
    const priceAedFils = mcPrice.trim() ? Math.round(Number(mcPrice) * 100) : null;
    const widthMm = mcWidthM.trim() ? Math.round(Number(mcWidthM) * 1000) : null;
    const depthMm = mcDepthM.trim() ? Math.round(Number(mcDepthM) * 1000) : null;
    if (!confirm(`Create ${rows.length} booths: ${rows[0].code} → ${rows[rows.length - 1].code}?`)) return;
    setMcBusy(true);
    try {
      const basePayload = { rows, size: mcTier || "custom", priceAedFils, colorHex: mcColor, widthMm, depthMm };
      let res = await fetch(`/api/admin/events/${eventId}/booths/mass-create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(basePayload),
      });
      let data = await res.json().catch(() => ({}));
      let skippedCodes: string[] = [];
      if (res.status === 409 && data.code === "DUPLICATE_CODES") {
        const proceed = confirm(`These booth codes already exist: ${data.duplicateCodes.join(", ")}.\n\nSkip those and create the rest?`);
        if (!proceed) return;
        res = await fetch(`/api/admin/events/${eventId}/booths/mass-create`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...basePayload, skipConflicts: true }),
        });
        data = await res.json().catch(() => ({}));
        skippedCodes = data.skippedCodes || [];
      }
      if (!res.ok) {
        setNotice(data.error || "Mass create failed");
        return;
      }
      setNotice(`Created ${data.created} booth${data.created === 1 ? "" : "s"}.${data.skipped ? ` ${data.skipped} skipped (already existed).` : ""}`);
      setMassCreateOpen(false);
      const createdCodes = rows.filter((r) => !skippedCodes.includes(r.code)).map((r) => r.code);
      await load();
      pushUndo({
        label: "Mass create",
        undo: async () => {
          const res3 = await fetch(`/api/admin/events/${eventId}/floorplan`);
          const d3 = await res3.json().catch(() => ({ booths: [] as AdminBooth[] }));
          const toDelete = (d3.booths as AdminBooth[]).filter((b) => createdCodes.includes(b.code));
          await Promise.all(toDelete.map((b) => fetch(`/api/admin/booths/${b.id}`, { method: "DELETE" })));
        },
        redo: async () => {
          await fetch(`/api/admin/events/${eventId}/booths/mass-create`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...basePayload, rows: rows.filter((r) => createdCodes.includes(r.code)), skipConflicts: true }),
          });
        },
      });
    } finally {
      setMcBusy(false);
    }
  }

  async function addFeature(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const rotation = Number(form.get("rotation")) || 0;
    // In MM mode the form collects position/size in meters (see JSX below)
    // — convert to mm and let the server derive the authoritative gridX/Y/
    // W/H from them (same pattern as booth create). gridX/Y/W/H sent here
    // are only the required-field placeholder the route re-derives from
    // xMm/yMm/widthMm/depthMm once scale is confirmed; in legacy percent
    // mode they're the real, final values (no mm fields sent at all).
    let body: Record<string, unknown>;
    if (coordinateMode === "MM") {
      const widthMm = Math.round(Number(form.get("widthM")) * 1000);
      const depthMm = Math.round(Number(form.get("depthM")) * 1000);
      const xMm = Math.round(Number(form.get("xM")) * 1000);
      const yMm = Math.round(Number(form.get("yM")) * 1000);
      const grid = mmToGridRect({ venueWidthMm: viewBox.width, venueDepthMm: viewBox.height }, { xMm, yMm, widthMm, depthMm });
      body = { type: form.get("type"), label: form.get("label"), rotation, widthMm, depthMm, xMm, yMm, ...grid };
    } else {
      body = {
        type: form.get("type"),
        label: form.get("label"),
        rotation,
        gridX: Number(form.get("gridX")),
        gridY: Number(form.get("gridY")),
        gridW: Number(form.get("gridW")),
        gridH: Number(form.get("gridH")),
      };
    }
    const res = await fetch(`/api/admin/events/${eventId}/features`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
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
    const res = await fetch(`/api/admin/booths/${selected.id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setNotice(data.error || "Could not delete this booth");
      return;
    }
    setSelectedIds(new Set());
    await load();
  }

  // From displayBooths (CURRENT VIEWBOX UNITS) so the "Fine-tune position"
  // inspector fields below show/edit real meters once scale is confirmed —
  // every other field on this object (price, color, status, widthMm, ...)
  // is untouched by that normalization, so nothing else here changes.
  const selected = selectedIds.size === 1 ? displayBooths.find((b) => selectedIds.has(b.id)) ?? null : null;
  const selectionCount = selectedIds.size;
  const selectedFeature = selectedFeatureId ? features.find((f) => f.id === selectedFeatureId) ?? null : null;

  return (
    <div>
      {notice && (
        <div className="mb-4 flex items-start justify-between gap-3 rounded-[8px] bg-amber-50 border border-amber-200 text-amber-900 text-sm px-4 py-3">
          <span>{notice}</span>
          <button onClick={() => setNotice(null)} className="shrink-0 text-amber-700 underline text-xs">
            dismiss
          </button>
        </div>
      )}

      {wizardOpen ? (
        <div className="mb-4 rounded-[10px] border border-brown/15 bg-cream p-5">
          <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
            <p className="label-caps">Floor Plan Setup Wizard</p>
            <button type="button" onClick={() => setWizardOpen(false)} className="text-xs text-brown-light underline">
              Close (use toolbar directly)
            </button>
          </div>

          <div className="flex flex-wrap gap-1.5 mb-5">
            {WIZARD_STEPS.map((label, i) => (
              <button
                key={label}
                type="button"
                onClick={() => setWizardStep(i)}
                className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                  i === wizardStep
                    ? "bg-brown text-cream-soft border-brown"
                    : i < wizardStep || (i === 1 ? venueScaleConfirmedState : true)
                      ? "border-brown/25 text-brown-light hover:text-brown-dark"
                      : "border-brown/10 text-brown-light/50"
                }`}
              >
                {i + 1}. {label}
              </button>
            ))}
          </div>

          {wizardStep === 0 && (
            <div className="max-w-md">
              <p className="text-sm text-brown-dark mb-1">Source</p>
              <p className="text-xs text-brown-light mb-3">
                Upload a reference image of the venue (a CAD export, a blueprint photo, an existing map) to trace booths against — optional, you can also build the floor plan from scratch.
              </p>
              <div className="flex items-center gap-3">
                <label className="px-3 py-1.5 rounded-[6px] border border-brown/25 text-xs cursor-pointer hover:bg-brown hover:text-cream-soft transition-colors">
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
                {floorPlanImageUrl && <span className="text-xs text-emerald-800">Image uploaded ✓</span>}
              </div>
            </div>
          )}

          {wizardStep === 1 && (
            <div className="max-w-md">
              <p className="text-sm text-brown-dark mb-1">Physical Scale — required to publish</p>
              <p className="text-xs text-brown-light mb-3">
                The venue&apos;s real width and depth, in meters. Every booth&apos;s position and size on the canvas is derived from this — it&apos;s what makes the floor plan mathematically accurate instead of a rough sketch.
              </p>
              <div className="flex items-center gap-1.5 text-xs mb-2">
                <input
                  type="number"
                  min="0.1"
                  step="0.1"
                  placeholder="Width (m)"
                  value={scaleWidthInput}
                  onChange={(e) => setScaleWidthInput(e.target.value)}
                  className="w-24 border border-brown/20 rounded-lg px-2 py-1.5 bg-cream-soft"
                />
                <span className="text-brown-light">×</span>
                <input
                  type="number"
                  min="0.1"
                  step="0.1"
                  placeholder="Depth (m)"
                  value={scaleDepthInput}
                  onChange={(e) => setScaleDepthInput(e.target.value)}
                  className="w-24 border border-brown/20 rounded-lg px-2 py-1.5 bg-cream-soft"
                />
              </div>
              {venueScaleConfirmedState ? (
                <p className="text-xs text-emerald-800">Confirmed: {(venueWidthMmState! / 1000).toFixed(1)}m × {(venueDepthMmState! / 1000).toFixed(1)}m ✓</p>
              ) : (
                <button type="button" disabled={scaleBusy} onClick={() => saveScale(true)} className="px-3 py-1.5 rounded-lg bg-brown text-cream-soft text-xs disabled:opacity-50">
                  Confirm scale &amp; continue
                </button>
              )}
            </div>
          )}

          {wizardStep === 2 && (
            <div className="max-w-md">
              <p className="text-sm text-brown-dark mb-1">Venue Boundary</p>
              <p className="text-xs text-brown-light mb-3">
                Defaults to a rectangle matching the physical scale above. Customize it if the venue is an L-shape, circle, oval, or other polygon, so booths placed outside the real usable floor get flagged.
              </p>
              {coordinateMode !== "MM" ? (
                <p className="text-xs text-amber-800">Confirm Physical Scale first (previous step).</p>
              ) : (
                <div className="flex items-center gap-3">
                  <button type="button" onClick={() => setBoundaryEditorOpen(true)} className="px-3 py-1.5 rounded-lg border border-brown/25 text-xs hover:bg-brown hover:text-cream-soft transition-colors">
                    Customize boundary
                  </button>
                  <span className="text-xs text-brown-light">
                    Current: {venueShapeState === "RECTANGLE" ? "rectangle (default)" : venueShapeState.toLowerCase()}
                  </span>
                </div>
              )}
            </div>
          )}

          {wizardStep === 3 && (
            <div className="max-w-md">
              <p className="text-sm text-brown-dark mb-1">Background Alignment</p>
              {!floorPlanImageUrl ? (
                <p className="text-xs text-brown-light">No reference image was uploaded in Source — nothing to align. Skip ahead.</p>
              ) : coordinateMode !== "MM" ? (
                <p className="text-xs text-amber-800">Confirm Physical Scale first.</p>
              ) : (
                <>
                  <p className="text-xs text-brown-light mb-3">
                    Position, scale and rotate the uploaded image so it lines up with the real venue dimensions — or use two-point calibration against a known real-world distance in the image.
                  </p>
                  <div className="flex items-center gap-3">
                    <button type="button" onClick={() => setBackgroundEditorOpen(true)} className="px-3 py-1.5 rounded-lg border border-brown/25 text-xs hover:bg-brown hover:text-cream-soft transition-colors">
                      Align background
                    </button>
                    <span className="text-xs text-brown-light">{bgNaturalWidthPx ? "Aligned ✓" : "Not aligned yet"}</span>
                  </div>
                </>
              )}
            </div>
          )}

          {wizardStep === 4 && (
            <div className="max-w-md">
              <p className="text-sm text-brown-dark mb-1">Booths</p>
              <p className="text-xs text-brown-light mb-3">
                Add booths one at a time by clicking the canvas, in bulk with Mass Create (a numbered run like B1→B67), or by importing a DXF/CAD export. All three are below the canvas once this wizard closes.
              </p>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowAdvanced(true);
                    setMassCreateOpen(true);
                    setWizardOpen(false);
                    requestAnimationFrame(() => document.getElementById("booth-tools-anchor")?.scrollIntoView({ behavior: "smooth", block: "start" }));
                  }}
                  className="px-3 py-1.5 rounded-lg border border-brown/25 text-xs hover:bg-brown hover:text-cream-soft transition-colors"
                >
                  Open booth tools
                </button>
                <span className="text-xs text-brown-light">{booths.length} booth{booths.length === 1 ? "" : "s"} so far</span>
              </div>
            </div>
          )}

          {wizardStep === 5 && (
            <div className="max-w-md">
              <p className="text-sm text-brown-dark mb-3">Review</p>
              <ul className="text-xs text-brown-light space-y-1.5 mb-4">
                <li>
                  Physical scale:{" "}
                  {venueScaleConfirmedState ? (
                    <span className="text-emerald-800">{(venueWidthMmState! / 1000).toFixed(1)}m × {(venueDepthMmState! / 1000).toFixed(1)}m confirmed ✓</span>
                  ) : (
                    <span className="text-amber-800">not confirmed — required before this event can publish</span>
                  )}
                </li>
                <li>Venue boundary: {venueShapeState === "RECTANGLE" ? "rectangle (default)" : venueShapeState.toLowerCase()}</li>
                <li>Background image: {floorPlanImageUrl ? (bgNaturalWidthPx ? "uploaded and aligned" : "uploaded, not aligned") : "none"}</li>
                <li>Booths placed: {booths.length}</li>
              </ul>
              <button type="button" onClick={() => setWizardOpen(false)} className="px-4 py-2 rounded-[6px] bg-brown text-cream-soft text-sm">
                Finish setup
              </button>
            </div>
          )}

          <div className="flex items-center gap-2 mt-5 pt-4 border-t border-brown/10">
            <button
              type="button"
              disabled={wizardStep === 0}
              onClick={() => setWizardStep((s) => Math.max(0, s - 1))}
              className="px-3 py-1.5 rounded-lg border border-brown/25 text-xs disabled:opacity-30"
            >
              Back
            </button>
            {wizardStep < WIZARD_STEPS.length - 1 && (
              <button
                type="button"
                disabled={wizardStep === 1 && !venueScaleConfirmedState}
                onClick={() => setWizardStep((s) => Math.min(WIZARD_STEPS.length - 1, s + 1))}
                className="px-3 py-1.5 rounded-lg border border-brown/25 text-xs disabled:opacity-30"
              >
                {wizardStep === 1 ? "Continue" : "Skip / Continue"}
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="mb-2">
          <button type="button" onClick={() => { setWizardOpen(true); setWizardStep(0); }} className="text-xs text-brown-light underline">
            Open Setup Wizard
          </button>
        </div>
      )}

      {/* Compact top toolbar — upload, undo/redo, guide toggles. Booth
          creation and the selection inspector live in the right-hand panel
          below, instead of stacked as forms above/below the canvas. */}
      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-[10px] border border-brown/10 bg-cream p-3">
        <label className="px-3 py-1.5 rounded-[6px] border border-brown/25 text-xs cursor-pointer hover:bg-brown hover:text-cream-soft transition-colors">
          {uploadingImage ? "Uploading…" : floorPlanImageUrl ? "Replace image" : "Upload floor plan image"}
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

        <div className="w-px h-5 bg-brown/15 mx-1" />

        <button
          type="button"
          onClick={handleUndo}
          disabled={undoStack.length === 0}
          title="Undo (Cmd/Ctrl+Z)"
          className="w-7 h-7 rounded-full border border-brown/25 hover:bg-brown/10 disabled:opacity-30 text-sm"
        >
          ↶
        </button>
        <button
          type="button"
          onClick={handleRedo}
          disabled={redoStack.length === 0}
          title="Redo (Cmd/Ctrl+Shift+Z)"
          className="w-7 h-7 rounded-full border border-brown/25 hover:bg-brown/10 disabled:opacity-30 text-sm"
        >
          ↷
        </button>

        <div className="w-px h-5 bg-brown/15 mx-1" />

        <label className="flex items-center gap-1.5 cursor-pointer text-xs text-brown-light">
          <input type="checkbox" checked={smartGuidesEnabled} onChange={toggleSmartGuides} />
          Smart guides
        </label>
        <label className="flex items-center gap-1.5 cursor-pointer text-xs text-brown-light">
          <input type="checkbox" checked={gridSnapEnabled} onChange={toggleGridSnap} />
          Snap to grid
        </label>

        <div className="w-px h-5 bg-brown/15 mx-1" />

        {scaleFormOpen ? (
          <div className="flex items-center gap-1.5 text-xs">
            <input
              type="number"
              min="0.1"
              step="0.1"
              placeholder="Width (m)"
              value={scaleWidthInput}
              onChange={(e) => setScaleWidthInput(e.target.value)}
              className="w-24 border border-brown/20 rounded-lg px-2 py-1 bg-cream-soft"
            />
            <span className="text-brown-light">×</span>
            <input
              type="number"
              min="0.1"
              step="0.1"
              placeholder="Depth (m)"
              value={scaleDepthInput}
              onChange={(e) => setScaleDepthInput(e.target.value)}
              className="w-24 border border-brown/20 rounded-lg px-2 py-1 bg-cream-soft"
            />
            <button type="button" disabled={scaleBusy} onClick={() => saveScale(true)} className="px-2 py-1 rounded-lg bg-brown text-cream-soft disabled:opacity-50">
              Confirm scale
            </button>
            <button type="button" disabled={scaleBusy} onClick={() => saveScale(false)} className="px-2 py-1 rounded-lg border border-brown/25 disabled:opacity-50">
              Save draft
            </button>
            <button type="button" onClick={() => setScaleFormOpen(false)} className="text-brown-light underline">
              Cancel
            </button>
          </div>
        ) : venueScaleConfirmedState && venueWidthMmState && venueDepthMmState ? (
          <button type="button" onClick={() => setScaleFormOpen(true)} className="text-xs text-brown-light hover:text-brown">
            Physical scale: {(venueWidthMmState / 1000).toFixed(1)}m × {(venueDepthMmState / 1000).toFixed(1)}m (confirmed — proportions above are true to venue)
          </button>
        ) : (
          <button type="button" onClick={() => setScaleFormOpen(true)} className="text-xs text-amber-800 hover:text-amber-900 font-medium">
            ⚠ Venue Scale Needs Configuration — set physical scale for accurate booth proportions
          </button>
        )}

        {coordinateMode === "MM" && (
          <>
            <div className="w-px h-5 bg-brown/15 mx-1" />
            <button type="button" onClick={() => setBoundaryEditorOpen((v) => !v)} className="text-xs text-brown-light hover:text-brown">
              {venueShapeState === "RECTANGLE" ? "Venue boundary: rectangle" : `Venue boundary: ${venueShapeState.toLowerCase()} (custom)`}
            </button>
            <button type="button" onClick={() => setBackgroundEditorOpen((v) => !v)} disabled={!floorPlanImageUrl} className="text-xs text-brown-light hover:text-brown disabled:opacity-40 disabled:cursor-not-allowed">
              {bgNaturalWidthPx ? "Background: aligned" : "Background: not aligned"}
            </button>
          </>
        )}

        {!venueWidthM && (
          <span className="text-xs text-brown-light/70 ml-auto">
            Tip: set a venue width (meters) in Settings to show real distances while dragging.
          </span>
        )}
      </div>
      {coordinateMode === "MM" && (
        <p className="mb-3 -mt-2 text-[11px] text-brown-light/70">
          New booths, Mass Create, and bulk size changes below now store true physical dimensions ({viewBox.width / 1000}m × {viewBox.height / 1000}m venue) and render at genuinely proportional size.
        </p>
      )}

      {boundaryEditorOpen && coordinateMode === "MM" && (
        <VenueBoundaryEditor
          eventId={eventId}
          venueWidthMm={viewBox.width}
          venueDepthMm={viewBox.height}
          initialShape={venueShapeState}
          initialBoundaryJson={venueBoundaryJsonState}
          booths={booths.map((b) => ({ id: b.id, code: b.code, xMm: b.xMm ?? null, yMm: b.yMm ?? null, widthMm: b.widthMm ?? null, depthMm: b.depthMm ?? null, rotation: b.rotation ?? null }))}
          onSaved={(shape, boundaryJson) => {
            setVenueShapeState(shape);
            setVenueBoundaryJsonState(boundaryJson);
            setBoundaryEditorOpen(false);
            setNotice("Venue boundary saved.");
          }}
          onClose={() => setBoundaryEditorOpen(false)}
        />
      )}

      {backgroundEditorOpen && coordinateMode === "MM" && floorPlanImageUrl && (
        <BackgroundAlignmentEditor
          eventId={eventId}
          venueWidthMm={viewBox.width}
          venueDepthMm={viewBox.height}
          imageUrl={floorPlanImageUrl}
          initial={{
            naturalWidthPx: bgNaturalWidthPx,
            naturalHeightPx: bgNaturalHeightPx,
            offsetXMm: bgOffsetXMm,
            offsetYMm: bgOffsetYMm,
            scale: bgScale,
            rotationDeg: bgRotationDeg,
            locked: bgLocked,
          }}
          onSaved={(next) => {
            setBgNaturalWidthPx(next.naturalWidthPx);
            setBgNaturalHeightPx(next.naturalHeightPx);
            setBgOffsetXMm(next.offsetXMm);
            setBgOffsetYMm(next.offsetYMm);
            setBgScale(next.scale);
            setBgRotationDeg(next.rotationDeg);
            setBgLocked(next.locked);
            setBackgroundEditorOpen(false);
            setNotice("Background alignment saved.");
          }}
          onClose={() => setBackgroundEditorOpen(false)}
        />
      )}

      <div className="flex flex-col lg:flex-row gap-6 items-start">
        <div className="flex-1 min-w-0 w-full">
          <FloorPlan
            features={displayFeatures}
            booths={displayBooths}
            sizeStyles={sizeStyles}
            allowAnyStatusClick
            backgroundImageUrl={floorPlanImageUrl}
            placementMode={placementOn}
            onCanvasClick={handleCanvasClick}
            onDeselect={() => setSelectedIds(new Set())}
            editable={!placementOn}
            onBoothCommit={onBoothCommit}
            selectedFeatureId={selectedFeatureId}
            onFeatureSelectionChange={setSelectedFeatureId}
            onFeatureCommit={onFeatureCommit}
            selectedIds={selectedIds}
            onSelectionChange={setSelectedIds}
            onGroupCommit={onGroupCommit}
            onDeleteSelected={deleteSelection}
            onDuplicateSelected={duplicateSelection}
            smartGuidesEnabled={smartGuidesEnabled}
            gridSnapEnabled={gridSnapEnabled}
            venueWidthM={venueWidthM}
            // Safe now: displayBooths/displayFeatures resolve gridX/Y/W/H
            // into CURRENT VIEWBOX UNITS (see the useMemo above), matching
            // whatever viewBox/coordinateMode says — FloorPlan's own drag/
            // resize/rotate/snap math was already fully viewBox-parametric
            // (unitScaleOf, snapTuningFor, computeGroupMovePatch etc. all
            // take viewBox/tuning as params); it just needed data in the
            // right units. Patches it emits come back in those same units
            // and get translated to the server's real field names by
            // worldPatchToServerPatch inside patchBoothRaw before persisting.
            viewBox={viewBox}
            coordinateMode={coordinateMode}
            backgroundAlignment={{
              naturalWidthPx: bgNaturalWidthPx,
              naturalHeightPx: bgNaturalHeightPx,
              offsetXMm: bgOffsetXMm,
              offsetYMm: bgOffsetYMm,
              scale: bgScale,
              rotationDeg: bgRotationDeg,
            }}
          />
          <Legend sizeStyles={sizeStyles} />

          <div id="booth-tools-anchor" className="mt-8">
            <button type="button" onClick={() => setShowAdvanced((v) => !v)} className="text-xs text-brown-light underline">
              {showAdvanced ? "Hide advanced tools" : "Advanced: add structural features / bulk-import booths"}
            </button>
          </div>

          {showAdvanced && (
            <div className="mt-4 space-y-6">
              <div className="rounded-[10px] border border-brown/10 bg-cream p-5">
                <p className="text-sm font-medium text-brown-dark mb-1">Import from CAD (DXF)</p>
                <p className="text-xs text-brown-light mb-3">
                  Detects booth-shaped rectangles and their labels from a DXF floor-plan export and turns them into real, interactive DAH booths — identical to a manually-created booth. Nothing is created until you review the preview below.
                </p>
                <CadImportPanel eventId={eventId} existingCodes={booths.map((b) => b.code)} onImported={load} />
              </div>

              <form onSubmit={addFeature} className="rounded-[10px] border border-brown/10 bg-cream p-5">
                <p className="text-sm font-medium text-brown-dark mb-3">
                  Add a structural feature (entrance, toilets, office, loading, stairs)
                </p>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <select name="type" className="border border-brown/20 rounded-lg px-2 py-1.5 bg-cream-soft col-span-2">
                    {FEATURE_TYPE.map((t) => (
                      <option key={t} value={t}>
                        {t.replaceAll("_", " ")}
                      </option>
                    ))}
                  </select>
                  <input name="label" placeholder="Label" required className="border border-brown/20 rounded-lg px-2 py-1.5 bg-cream-soft col-span-2" />
                  {coordinateMode === "MM" ? (
                    <>
                      <input name="xM" type="number" step="0.1" placeholder="X (m)" required className="border border-brown/20 rounded-lg px-2 py-1.5 bg-cream-soft" />
                      <input name="yM" type="number" step="0.1" placeholder="Y (m)" required className="border border-brown/20 rounded-lg px-2 py-1.5 bg-cream-soft" />
                      <input name="widthM" type="number" step="0.1" min="0.1" placeholder="Width (m)" required className="border border-brown/20 rounded-lg px-2 py-1.5 bg-cream-soft" />
                      <input name="depthM" type="number" step="0.1" min="0.1" placeholder="Depth (m)" required className="border border-brown/20 rounded-lg px-2 py-1.5 bg-cream-soft" />
                    </>
                  ) : (
                    <>
                      <input name="gridX" type="number" step="0.5" placeholder="X %" required className="border border-brown/20 rounded-lg px-2 py-1.5 bg-cream-soft" />
                      <input name="gridY" type="number" step="0.5" placeholder="Y %" required className="border border-brown/20 rounded-lg px-2 py-1.5 bg-cream-soft" />
                      <input name="gridW" type="number" step="0.5" placeholder="Width %" required className="border border-brown/20 rounded-lg px-2 py-1.5 bg-cream-soft" />
                      <input name="gridH" type="number" step="0.5" placeholder="Height %" required className="border border-brown/20 rounded-lg px-2 py-1.5 bg-cream-soft" />
                    </>
                  )}
                  <input name="rotation" type="number" placeholder="Rotation °" className="border border-brown/20 rounded-lg px-2 py-1.5 bg-cream-soft col-span-2" />
                </div>
                <button type="submit" className="mt-3 px-4 py-2 rounded-[6px] bg-brown text-cream-soft text-sm">
                  Add feature
                </button>
                {features.length > 0 && (
                  <ul className="mt-4 space-y-1.5 border-t border-brown/10 pt-3">
                    {features.map((f) => (
                      <li key={f.id} className="flex items-center justify-between text-xs text-brown-light">
                        <span>
                          {f.label || f.type.replaceAll("_", " ")} — {f.type.replaceAll("_", " ")}
                          {f.rotation ? ` (${f.rotation}°)` : ""}
                        </span>
                        <button
                          type="button"
                          onClick={async () => {
                            if (!confirm(`Remove "${f.label || f.type}"?`)) return;
                            await fetch(`/api/admin/features/${f.id}`, { method: "DELETE" });
                            await load();
                          }}
                          className="text-red-700 underline"
                        >
                          Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </form>

              <div className="rounded-[10px] border border-brown/10 bg-cream p-5">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium text-brown-dark">Mass Create Booths</p>
                  <button type="button" onClick={() => setMassCreateOpen((v) => !v)} className="text-xs text-brown-light underline">
                    {massCreateOpen ? "Hide" : "Open"}
                  </button>
                </div>
                <p className="text-xs text-brown-light mb-3">Create a numbered run of booths — e.g. B1 → B67 — with shared starting price, size and tier, without adding them one by one.</p>
                {massCreateOpen && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-4 gap-2 text-sm">
                      <label className="flex flex-col gap-1 text-xs text-brown-light">
                        Prefix
                        <input value={mcPrefix} onChange={(e) => setMcPrefix(e.target.value)} className="border border-brown/20 rounded-lg px-2 py-1.5 bg-cream-soft" />
                      </label>
                      <label className="flex flex-col gap-1 text-xs text-brown-light">
                        Start
                        <input value={mcStart} onChange={(e) => setMcStart(e.target.value)} type="number" className="border border-brown/20 rounded-lg px-2 py-1.5 bg-cream-soft" />
                      </label>
                      <label className="flex flex-col gap-1 text-xs text-brown-light">
                        End
                        <input value={mcEnd} onChange={(e) => setMcEnd(e.target.value)} type="number" className="border border-brown/20 rounded-lg px-2 py-1.5 bg-cream-soft" />
                      </label>
                      <label className="flex flex-col gap-1 text-xs text-brown-light">
                        Padding
                        <select value={mcPadding} onChange={(e) => setMcPadding(e.target.value as typeof mcPadding)} className="border border-brown/20 rounded-lg px-2 py-1.5 bg-cream-soft">
                          <option value="none">None</option>
                          <option value="2">2 digits</option>
                          <option value="3">3 digits</option>
                        </select>
                      </label>
                    </div>
                    <p className="text-xs text-brown-light">
                      Preview: {mcGenerateCodes().slice(0, 3).join(", ")}
                      {mcGenerateCodes().length > 3 ? ` … ${mcGenerateCodes()[mcGenerateCodes().length - 1]}` : ""}
                      {mcGenerateCodes().length > 0 ? ` (${mcGenerateCodes().length} booths)` : ""}
                    </p>

                    <div className="grid grid-cols-2 gap-2 text-sm">
                      {tiers.length > 0 ? (
                        <label className="flex flex-col gap-1 text-xs text-brown-light">
                          Tier
                          <select value={mcTier} onChange={(e) => setMcTier(e.target.value)} className="border border-brown/20 rounded-lg px-2 py-1.5 bg-cream-soft">
                            <option value="">Custom (use price below)</option>
                            {tiers.map((t) => (
                              <option key={t.sizeKey} value={t.sizeKey}>
                                {t.label}
                              </option>
                            ))}
                          </select>
                        </label>
                      ) : (
                        <div />
                      )}
                      <label className="flex flex-col gap-1 text-xs text-brown-light">
                        Price (AED, optional override)
                        <input value={mcPrice} onChange={(e) => setMcPrice(e.target.value)} type="number" step="0.01" min="0" placeholder="1837.5" className="border border-brown/20 rounded-lg px-2 py-1.5 bg-cream-soft" />
                      </label>
                      <label className="flex flex-col gap-1 text-xs text-brown-light">
                        Width (m)
                        <input value={mcWidthM} onChange={(e) => setMcWidthM(e.target.value)} type="number" step="0.1" min="0" className="border border-brown/20 rounded-lg px-2 py-1.5 bg-cream-soft" />
                      </label>
                      <label className="flex flex-col gap-1 text-xs text-brown-light">
                        Depth (m)
                        <input value={mcDepthM} onChange={(e) => setMcDepthM(e.target.value)} type="number" step="0.1" min="0" className="border border-brown/20 rounded-lg px-2 py-1.5 bg-cream-soft" />
                      </label>
                      <label className="flex flex-col gap-1 text-xs text-brown-light">
                        Color
                        <input value={mcColor} onChange={(e) => setMcColor(e.target.value)} type="color" className="border border-brown/20 rounded-lg h-9 bg-cream-soft" />
                      </label>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-sm items-end">
                      <label className="flex flex-col gap-1 text-xs text-brown-light">
                        Placement
                        <select value={mcPlacement} onChange={(e) => setMcPlacement(e.target.value as typeof mcPlacement)} className="border border-brown/20 rounded-lg px-2 py-1.5 bg-cream-soft">
                          <option value="grid">Grid</option>
                          <option value="row">Single row</option>
                        </select>
                      </label>
                      {mcPlacement === "grid" && (
                        <label className="flex flex-col gap-1 text-xs text-brown-light">
                          Columns
                          <input value={mcColumns} onChange={(e) => setMcColumns(e.target.value)} type="number" min="1" className="border border-brown/20 rounded-lg px-2 py-1.5 bg-cream-soft" />
                        </label>
                      )}
                    </div>
                    <p className="text-xs text-brown-light">
                      New booths are placed in a staging {mcPlacement === "grid" ? "grid" : "row"} so they never land on top of each other — reposition them afterward with drag, align and group-move like any other booth.
                    </p>

                    <button
                      type="button"
                      onClick={submitMassCreate}
                      disabled={mcBusy || mcGenerateCodes().length === 0}
                      className="w-full px-4 py-2 rounded-[6px] bg-brown text-cream-soft text-sm disabled:opacity-50"
                    >
                      {mcBusy ? "Creating…" : `Import ${mcGenerateCodes().length} Booths`}
                    </button>
                  </div>
                )}
              </div>

              <div className="rounded-[10px] border border-brown/10 bg-cream p-5">
                <p className="text-sm font-medium text-brown-dark mb-2">Bulk import booths (paste JSON)</p>
                <p className="text-xs text-brown-light mb-3">
                  {'Array of {"code","size","gridX","gridY","gridW","gridH","widthMm","depthMm"} (X/Y/W/H as % of the canvas, 0-100; widthMm/depthMm are optional real booth dimensions in millimeters, used for setup-size fit checks) — paste the full real booth list here once confirmed. Existing codes are updated in place; new codes are created as available.'}
                </p>
                <textarea
                  value={bulkText}
                  onChange={(e) => setBulkText(e.target.value)}
                  rows={6}
                  placeholder='[{"code":"A1","size":"2x2","gridX":10,"gridY":10,"gridW":6,"gridH":6,"widthMm":2000,"depthMm":2000}]'
                  className="w-full border border-brown/20 rounded-lg px-3 py-2 bg-cream-soft text-xs font-mono"
                />
                <button onClick={submitBulk} className="mt-3 px-4 py-2 rounded-[6px] bg-brown text-cream-soft text-sm">
                  Import
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right inspector: multi-select tools, then a single booth's editor,
            then (when nothing is selected) the add-a-booth mini-form. */}
        <div className="w-full lg:w-80 shrink-0 lg:sticky lg:top-4 space-y-4">
          {selectedFeature && (
            <form
              key={selectedFeature.id}
              className="rounded-[10px] border border-emerald-300 bg-emerald-50 p-4 space-y-3"
              onSubmit={async (e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                setFeatureBusy(true);
                try {
                  const res = await fetch(`/api/admin/features/${selectedFeature.id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ label: fd.get("label"), type: fd.get("type") }),
                  });
                  if (res.ok) {
                    const { feature } = await res.json();
                    setFeatures((prev) => prev.map((f) => (f.id === feature.id ? { ...f, ...feature } : f)));
                    setNotice("Feature updated.");
                  } else {
                    setNotice("Couldn't update the feature.");
                  }
                } finally {
                  setFeatureBusy(false);
                }
              }}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-emerald-900">Editing feature</span>
                <button type="button" onClick={() => setSelectedFeatureId(null)} className="text-xs text-emerald-900 underline">
                  Deselect
                </button>
              </div>
              <p className="text-xs text-emerald-800/70">Drag to move · drag the green handle above it to rotate.</p>
              <input name="label" defaultValue={selectedFeature.label} placeholder="Label" className="w-full border border-emerald-300 rounded-lg px-2 py-1.5 text-sm bg-white" />
              <select name="type" defaultValue={selectedFeature.type} className="w-full border border-emerald-300 rounded-lg px-2 py-1.5 text-sm bg-white">
                {FEATURE_TYPE.map((t) => (
                  <option key={t} value={t}>
                    {t.replaceAll("_", " ")}
                  </option>
                ))}
              </select>
              <div className="flex items-center gap-2">
                <button type="submit" disabled={featureBusy} className="px-3 py-1.5 rounded-lg bg-emerald-800 text-white text-xs disabled:opacity-50">
                  Save
                </button>
                <button
                  type="button"
                  disabled={featureBusy}
                  onClick={async () => {
                    if (!confirm(`Remove "${selectedFeature.label || selectedFeature.type}"?`)) return;
                    setFeatureBusy(true);
                    try {
                      await fetch(`/api/admin/features/${selectedFeature.id}`, { method: "DELETE" });
                      setFeatures((prev) => prev.filter((f) => f.id !== selectedFeature.id));
                      setSelectedFeatureId(null);
                    } finally {
                      setFeatureBusy(false);
                    }
                  }}
                  className="px-3 py-1.5 rounded-lg border border-red-300 text-red-700 text-xs disabled:opacity-50"
                >
                  Delete
                </button>
              </div>
            </form>
          )}

          {selectionCount > 1 && (
            <div className="rounded-[10px] border border-blue-300 bg-blue-50 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-blue-900">{selectionCount} booths selected</span>
                <button type="button" onClick={() => setSelectedIds(new Set())} className="text-xs text-blue-900 underline">
                  Clear
                </button>
              </div>
              <p className="text-xs text-blue-800/70">
                Drag any selected booth to move the group · arrow keys nudge · Cmd/Ctrl+D duplicates · Delete removes
              </p>

              <div>
                <p className="text-xs text-blue-900 mb-1.5">Align</p>
                <div className="flex flex-wrap gap-1.5">
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
                      className="px-2.5 py-1 rounded-[6px] border border-blue-300 bg-white text-xs text-blue-900 hover:bg-blue-100"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-xs text-blue-900 mb-1.5">Distribute</p>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => distributeSelection("horizontal")}
                    disabled={selectionCount < 3}
                    className="px-2.5 py-1 rounded-[6px] border border-blue-300 bg-white text-xs text-blue-900 hover:bg-blue-100 disabled:opacity-40"
                  >
                    Horizontally
                  </button>
                  <button
                    type="button"
                    onClick={() => distributeSelection("vertical")}
                    disabled={selectionCount < 3}
                    className="px-2.5 py-1 rounded-[6px] border border-blue-300 bg-white text-xs text-blue-900 hover:bg-blue-100 disabled:opacity-40"
                  >
                    Vertically
                  </button>
                </div>
              </div>

              <div className="border-t border-blue-200 pt-3 space-y-3">
                <p className="text-xs font-medium text-blue-900">Bulk edit {selectionCount} booths</p>

                <div className="grid grid-cols-2 gap-2">
                  <label className="flex flex-col gap-1 text-xs text-blue-900">
                    Price (AED)
                    <input
                      value={selectionPrice}
                      onChange={(e) => setSelectionPrice(e.target.value)}
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="1837.5"
                      className="border border-blue-300 rounded-lg px-2 py-1.5 bg-white text-sm w-full"
                    />
                  </label>
                  <div className="flex items-end">
                    <button
                      type="button"
                      onClick={applySelectionPrice}
                      disabled={applyingSelectionPrice || !selectionPrice.trim()}
                      className="w-full px-3 py-1.5 rounded-[6px] bg-blue-700 text-white text-xs disabled:opacity-50"
                    >
                      {applyingSelectionPrice ? "Applying…" : "Apply Price"}
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-[1fr_1fr_auto] gap-2 items-end">
                  <label className="flex flex-col gap-1 text-xs text-blue-900">
                    Width (m)
                    <input
                      value={selectionWidthM}
                      onChange={(e) => setSelectionWidthM(e.target.value)}
                      type="number"
                      step="0.1"
                      min="0"
                      placeholder="2.0"
                      className="border border-blue-300 rounded-lg px-2 py-1.5 bg-white text-sm w-full"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs text-blue-900">
                    Depth (m)
                    <input
                      value={selectionDepthM}
                      onChange={(e) => setSelectionDepthM(e.target.value)}
                      type="number"
                      step="0.1"
                      min="0"
                      placeholder="2.0"
                      className="border border-blue-300 rounded-lg px-2 py-1.5 bg-white text-sm w-full"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={applySelectionSize}
                    disabled={busyAction || !selectionWidthM.trim() || !selectionDepthM.trim()}
                    className="px-3 py-1.5 rounded-[6px] bg-blue-700 text-white text-xs disabled:opacity-50"
                  >
                    Apply Size
                  </button>
                </div>

                {tiers.length > 0 && (
                  <div className="grid grid-cols-[1fr_auto] gap-2 items-end">
                    <label className="flex flex-col gap-1 text-xs text-blue-900">
                      Tier
                      <select
                        value={selectionTierKey}
                        onChange={(e) => setSelectionTierKey(e.target.value)}
                        className="border border-blue-300 rounded-lg px-2 py-1.5 bg-white text-sm w-full"
                      >
                        <option value="">— Choose a tier —</option>
                        {tiers.map((t) => (
                          <option key={t.sizeKey} value={t.sizeKey}>
                            {t.label} — {formatAed(t.priceAedFils)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      onClick={applySelectionTier}
                      disabled={busyAction || !selectionTierKey}
                      className="px-3 py-1.5 rounded-[6px] bg-blue-700 text-white text-xs disabled:opacity-50"
                    >
                      Apply Tier
                    </button>
                  </div>
                )}

                <div className="grid grid-cols-[1fr_auto] gap-2 items-end">
                  <label className="flex flex-col gap-1 text-xs text-blue-900">
                    Status
                    <select
                      value={selectionStatus}
                      onChange={(e) => setSelectionStatus(e.target.value as typeof selectionStatus)}
                      className="border border-blue-300 rounded-lg px-2 py-1.5 bg-white text-sm w-full"
                    >
                      <option value="">— Choose a status —</option>
                      <option value="AVAILABLE">Available</option>
                      <option value="RESERVED">Admin Reserved (Unavailable)</option>
                    </select>
                  </label>
                  <button
                    type="button"
                    onClick={applySelectionStatus}
                    disabled={busyAction || !selectionStatus}
                    className="px-3 py-1.5 rounded-[6px] bg-blue-700 text-white text-xs disabled:opacity-50"
                  >
                    Apply Status
                  </button>
                </div>
                <p className="text-[11px] text-blue-800/70">
                  Booths with a confirmed booking or an active vendor hold are always skipped by a status change, never released.
                </p>
              </div>

              <div className="border-t border-blue-200 pt-3">
                <button type="button" onClick={() => setAutoNumberOpen((v) => !v)} className="text-xs font-medium text-blue-900 underline">
                  {autoNumberOpen ? "Hide Auto Number Selected" : "Auto Number Selected"}
                </button>
                {autoNumberOpen && (
                  <div className="mt-2 space-y-2">
                    <div className="grid grid-cols-3 gap-2">
                      <label className="flex flex-col gap-1 text-xs text-blue-900">
                        Prefix
                        <input value={autoNumberPrefix} onChange={(e) => setAutoNumberPrefix(e.target.value)} className="border border-blue-300 rounded-lg px-2 py-1.5 bg-white text-sm" />
                      </label>
                      <label className="flex flex-col gap-1 text-xs text-blue-900">
                        Start
                        <input value={autoNumberStart} onChange={(e) => setAutoNumberStart(e.target.value)} type="number" className="border border-blue-300 rounded-lg px-2 py-1.5 bg-white text-sm" />
                      </label>
                      <label className="flex flex-col gap-1 text-xs text-blue-900">
                        Padding
                        <select value={autoNumberPadding} onChange={(e) => setAutoNumberPadding(e.target.value as typeof autoNumberPadding)} className="border border-blue-300 rounded-lg px-2 py-1.5 bg-white text-sm">
                          <option value="none">None</option>
                          <option value="2">2 digits</option>
                          <option value="3">3 digits</option>
                        </select>
                      </label>
                    </div>
                    <label className="flex flex-col gap-1 text-xs text-blue-900">
                      Order
                      <select value={autoNumberOrder} onChange={(e) => setAutoNumberOrder(e.target.value as typeof autoNumberOrder)} className="border border-blue-300 rounded-lg px-2 py-1.5 bg-white text-sm">
                        <option value="row">Left → Right, then Top → Bottom</option>
                        <option value="column">Top → Bottom, then Left → Right</option>
                      </select>
                    </label>
                    {autoNumberPreview().length > 0 && (
                      <div className="rounded-[8px] border border-blue-200 bg-white p-2 max-h-32 overflow-y-auto text-xs text-blue-900 space-y-0.5">
                        {autoNumberPreview().map((p) => (
                          <div key={p.id} className="flex items-center justify-between">
                            <span className="text-blue-800/60">{p.from}</span>
                            <span>→ {p.to}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={applyAutoNumber}
                      disabled={autoNumberBusy || autoNumberPreview().length === 0}
                      className="w-full px-3 py-1.5 rounded-[6px] bg-blue-700 text-white text-xs disabled:opacity-50"
                    >
                      {autoNumberBusy ? "Renaming…" : `Apply Auto Number to ${selectionCount} Booths`}
                    </button>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap gap-2 border-t border-blue-200 pt-3">
                <button
                  type="button"
                  onClick={duplicateSelection}
                  disabled={busyAction}
                  className="px-3 py-1.5 rounded-[6px] border border-blue-300 bg-white text-xs text-blue-900 disabled:opacity-50"
                >
                  Duplicate
                </button>
                <button
                  type="button"
                  onClick={deleteSelection}
                  disabled={busyAction}
                  className="px-3 py-1.5 rounded-[6px] border border-red-300 text-red-700 text-xs disabled:opacity-50"
                >
                  Delete selected
                </button>
              </div>
            </div>
          )}

          {selectionCount <= 1 && selected && (
            <div className="rounded-[10px] border border-brown/20 bg-cream p-5">
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

              <div className="space-y-3 text-sm">
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
                <div className="grid grid-cols-2 gap-2">
                  <label className="flex flex-col gap-1">
                    Width (m)
                    <input
                      id="booth-width-m"
                      type="number"
                      step="0.1"
                      min="0"
                      defaultValue={selected.widthMm != null ? selected.widthMm / 1000 : ""}
                      placeholder="e.g. 2.0"
                      className="border border-brown/20 rounded-lg px-3 py-2 bg-cream-soft"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    Depth (m)
                    <input
                      id="booth-depth-m"
                      type="number"
                      step="0.1"
                      min="0"
                      defaultValue={selected.depthMm != null ? selected.depthMm / 1000 : ""}
                      placeholder="e.g. 2.0"
                      className="border border-brown/20 rounded-lg px-3 py-2 bg-cream-soft"
                    />
                  </label>
                </div>
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
                <label className="flex flex-col gap-1">
                  Or a manual name (walk-in / favor, no application on file)
                  <input id="booth-manual-name" defaultValue={selected.occupant?.applicationId ? "" : selected.occupant?.name || ""} className="border border-brown/20 rounded-lg px-3 py-2 bg-cream-soft" />
                </label>

                <p className="text-xs text-brown-light">
                  Drag the booth to move it, its corner handles to resize, and the handle above it to rotate — or fine-tune exact numbers below.
                </p>
                <details>
                  <summary className="text-xs text-brown-light cursor-pointer">Fine-tune position{coordinateMode === "LEGACY_PERCENT" ? ", size " : " "}&amp; rotation</summary>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {coordinateMode === "MM" ? (
                      <>
                        <input id="booth-x" type="number" step="0.1" defaultValue={(selected.gridX / 1000).toFixed(2)} placeholder="X (m)" className="border border-brown/20 rounded-lg px-2 py-1.5 bg-cream-soft text-xs" />
                        <input id="booth-y" type="number" step="0.1" defaultValue={(selected.gridY / 1000).toFixed(2)} placeholder="Y (m)" className="border border-brown/20 rounded-lg px-2 py-1.5 bg-cream-soft text-xs" />
                      </>
                    ) : (
                      <>
                        <input id="booth-x" type="number" step="0.5" defaultValue={selected.gridX} placeholder="X %" className="border border-brown/20 rounded-lg px-2 py-1.5 bg-cream-soft text-xs" />
                        <input id="booth-y" type="number" step="0.5" defaultValue={selected.gridY} placeholder="Y %" className="border border-brown/20 rounded-lg px-2 py-1.5 bg-cream-soft text-xs" />
                        <input id="booth-w" type="number" step="0.5" defaultValue={selected.gridW} placeholder="W %" className="border border-brown/20 rounded-lg px-2 py-1.5 bg-cream-soft text-xs" />
                        <input id="booth-h" type="number" step="0.5" defaultValue={selected.gridH} placeholder="H %" className="border border-brown/20 rounded-lg px-2 py-1.5 bg-cream-soft text-xs" />
                      </>
                    )}
                    <input id="booth-rotation" type="number" step="1" defaultValue={selected.rotation ?? 0} placeholder="Rotate °" className="border border-brown/20 rounded-lg px-2 py-1.5 bg-cream-soft text-xs col-span-2" />
                  </div>
                  {coordinateMode === "MM" && <p className="mt-1 text-[11px] text-brown-light/70">Size is set via Width/Depth (m) above.</p>}
                </details>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
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
                    const rotation = (document.getElementById("booth-rotation") as HTMLInputElement).value;
                    const widthM = (document.getElementById("booth-width-m") as HTMLInputElement).value;
                    const depthM = (document.getElementById("booth-depth-m") as HTMLInputElement).value;
                    const widthMm = widthM.trim() ? Math.round(Number(widthM) * 1000) : null;
                    const depthMm = depthM.trim() ? Math.round(Number(depthM) * 1000) : null;
                    // X/Y from the "Fine-tune" fields are already CURRENT
                    // VIEWBOX UNITS (see the selected= useMemo above) — in MM
                    // mode that's real meters (converted to mm below and
                    // sent as explicit xMm/yMm so the server takes its
                    // authoritative path instead of misreading an mm number
                    // under the name "gridX", which it always treats as a
                    // 0-100 percentage). Width/Depth (m) above are the only
                    // size control in MM mode — no gridW/gridH sent here.
                    const geometryPatch =
                      coordinateMode === "MM"
                        ? { xMm: Math.round(Number(x) * 1000), yMm: Math.round(Number(y) * 1000) }
                        : { gridX: Number(x), gridY: Number(y), gridW: Number((document.getElementById("booth-w") as HTMLInputElement).value), gridH: Number((document.getElementById("booth-h") as HTMLInputElement).value) };
                    saveSelected({
                      status,
                      code,
                      priceAedFils: price ? Math.round(Number(price) * 100) : null,
                      colorHex: color || null,
                      ...geometryPatch,
                      rotation: rotation ? Number(rotation) : 0,
                      assignedApplicationId: assignedApplicationId || null,
                      manualAssigneeName: assignedApplicationId ? null : manualAssigneeName || null,
                      widthMm,
                      depthMm,
                    });
                  }}
                  className="px-4 py-2 rounded-[6px] bg-brown text-cream-soft text-sm"
                >
                  Save
                </button>
                <button
                  onClick={() => saveSelected({ status: "AVAILABLE", assignedApplicationId: null, manualAssigneeName: null })}
                  className="px-4 py-2 rounded-[6px] border border-brown/30 text-sm"
                >
                  Clear to available
                </button>
                <button onClick={deleteSelected} className="px-4 py-2 rounded-[6px] border border-red-300 text-red-700 text-sm">
                  Delete booth
                </button>
              </div>
            </div>
          )}

          {selectionCount === 0 && (
            <div className="rounded-[10px] border border-brown/10 bg-cream p-5">
              <p className="text-sm font-medium text-brown-dark mb-1">Add a booth</p>
              <p className="text-xs text-brown-light mb-3">
                Fill in the details, then click &ldquo;Start placing&rdquo; and click anywhere on the map to drop it.
              </p>
              <div className="space-y-3">
                <label className="flex flex-col gap-1 text-xs text-brown-light">
                  Name <span className="text-brown-light/60">(ex: B25)</span>
                  <input
                    value={placeName}
                    onChange={(e) => setPlaceName(e.target.value)}
                    placeholder="B25"
                    className="border border-brown/20 rounded-lg px-2 py-1.5 bg-cream-soft text-sm"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs text-brown-light">
                  Price (AED) <span className="text-brown-light/60">(ex: 1837.5)</span>
                  <input
                    value={placePrice}
                    onChange={(e) => setPlacePrice(e.target.value)}
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    placeholder="1837.5"
                    className="border border-brown/20 rounded-lg px-2 py-1.5 bg-cream-soft text-sm"
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
                      className="border border-brown/20 rounded-lg px-2 py-1.5 bg-cream-soft text-sm flex-1 font-mono"
                    />
                  </div>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="flex flex-col gap-1 text-xs text-brown-light">
                    Width (m) <span className="text-brown-light/60">optional</span>
                    <input
                      value={placeWidthM}
                      onChange={(e) => setPlaceWidthM(e.target.value)}
                      type="number"
                      step="0.1"
                      min="0"
                      placeholder="2.0"
                      className="border border-brown/20 rounded-lg px-2 py-1.5 bg-cream-soft text-sm"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs text-brown-light">
                    Depth (m) <span className="text-brown-light/60">optional</span>
                    <input
                      value={placeDepthM}
                      onChange={(e) => setPlaceDepthM(e.target.value)}
                      type="number"
                      step="0.1"
                      min="0"
                      placeholder="2.0"
                      className="border border-brown/20 rounded-lg px-2 py-1.5 bg-cream-soft text-sm"
                    />
                  </label>
                </div>
                <button
                  type="button"
                  onClick={() => setPlacementOn((v) => !v)}
                  disabled={!placementOn && (!placeName.trim() || !placePrice.trim())}
                  className={`w-full px-4 py-2 rounded-[6px] text-sm disabled:opacity-50 ${
                    placementOn ? "bg-emerald-700 text-white" : "bg-brown text-cream-soft"
                  }`}
                >
                  {placementOn ? "Placing — click the map (click again to stop)" : "Start placing"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
