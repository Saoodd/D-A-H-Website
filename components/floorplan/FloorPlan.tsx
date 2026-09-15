"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { FloorFeature, FloorBooth, SizeStyle } from "./types";

function shadeColor(hex: string, amount: number): string {
  const m = hex.replace("#", "");
  const full = m.length === 3 ? m.split("").map((c) => c + c).join("") : m;
  const num = parseInt(full, 16);
  if (Number.isNaN(num)) return hex;
  const clamp = (v: number) => Math.min(255, Math.max(0, v));
  const r = clamp(((num >> 16) & 0xff) + amount);
  const g = clamp(((num >> 8) & 0xff) + amount);
  const b = clamp((num & 0xff) + amount);
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

/** Rotates a vector (x,y) by `deg` degrees — used to translate between a
 *  booth's own (unrotated) local coordinate space and the canvas's world
 *  space when dragging/resizing/rotating. */
function rotateVec(x: number, y: number, deg: number) {
  const rad = (deg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return { x: x * cos - y * sin, y: x * sin + y * cos };
}

// The floor plan canvas is always a 0-100 x 0-100 percentage space, whether
// or not there's a background image — booths/features store gridX/Y/W/H as
// percentages of this canvas. That keeps a single coordinate system for
// "click on the map to place a booth" regardless of whether admin is
// working over a real venue photo or the plain dotted background.
const VIEWBOX = 100;
const MIN_BOOTH_SIZE = 2;
const ROTATE_HANDLE_OFFSET = 6;
const ALIGN_THRESHOLD = 1; // percent — how close an edge/center has to be to another booth's to snap
const SPACING_TOLERANCE = 1.2; // percent — how close a gap has to be to a reference gap to snap-equalize
const GRID_SIZE = 1; // percent — snap-to-grid cell size
const NUDGE_AMOUNT = 0.5; // percent — arrow-key nudge
const NUDGE_AMOUNT_BIG = 2; // percent — shift+arrow-key nudge

interface GuideLine {
  orientation: "v" | "h";
  pos: number;
  from: number;
  to: number;
}
interface GuideLabel {
  x: number;
  y: number;
  text: string;
}
interface Guides {
  vLines: GuideLine[];
  hLines: GuideLine[];
  labels: GuideLabel[];
}
type Rect = { gridX: number; gridY: number; gridW: number; gridH: number };

function rangesOverlap(a1: number, a2: number, b1: number, b2: number) {
  return a1 < b2 && b1 < a2;
}

function formatDistance(gapPercent: number, venueWidthM?: number | null): string {
  if (venueWidthM && venueWidthM > 0) {
    const meters = (gapPercent / 100) * venueWidthM;
    return `${meters.toFixed(meters < 10 ? 1 : 0)}m`;
  }
  return `${gapPercent.toFixed(1)}%`;
}

/** Is the given DOM event target a text-entry element? Used to keep the
 *  canvas's keyboard shortcuts (select-all, arrows, delete) from hijacking
 *  normal typing in the surrounding form fields. */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

/** Best single edge/center alignment match on each axis, independently. */
function computeAlignmentSnap(dragged: Rect, others: FloorBooth[]) {
  const xCands = [
    { offset: 0, at: dragged.gridX },
    { offset: dragged.gridW / 2, at: dragged.gridX + dragged.gridW / 2 },
    { offset: dragged.gridW, at: dragged.gridX + dragged.gridW },
  ];
  const yCands = [
    { offset: 0, at: dragged.gridY },
    { offset: dragged.gridH / 2, at: dragged.gridY + dragged.gridH / 2 },
    { offset: dragged.gridH, at: dragged.gridY + dragged.gridH },
  ];
  let bestX: { offset: number; value: number; delta: number; other: FloorBooth } | null = null;
  let bestY: { offset: number; value: number; delta: number; other: FloorBooth } | null = null;
  for (const o of others) {
    const oxs = [o.gridX, o.gridX + o.gridW / 2, o.gridX + o.gridW];
    const oys = [o.gridY, o.gridY + o.gridH / 2, o.gridY + o.gridH];
    for (const c of xCands) {
      for (const ov of oxs) {
        const delta = Math.abs(c.at - ov);
        if (delta <= ALIGN_THRESHOLD && (!bestX || delta < bestX.delta)) bestX = { offset: c.offset, value: ov, delta, other: o };
      }
    }
    for (const c of yCands) {
      for (const ov of oys) {
        const delta = Math.abs(c.at - ov);
        if (delta <= ALIGN_THRESHOLD && (!bestY || delta < bestY.delta)) bestY = { offset: c.offset, value: ov, delta, other: o };
      }
    }
  }
  const vLines: GuideLine[] = [];
  const hLines: GuideLine[] = [];
  let gridX: number | undefined;
  let gridY: number | undefined;
  if (bestX) {
    gridX = bestX.value - bestX.offset;
    const y1 = Math.min(dragged.gridY, bestX.other.gridY);
    const y2 = Math.max(dragged.gridY + dragged.gridH, bestX.other.gridY + bestX.other.gridH);
    vLines.push({ orientation: "v", pos: bestX.value, from: y1 - 2, to: y2 + 2 });
  }
  if (bestY) {
    gridY = bestY.value - bestY.offset;
    const x1 = Math.min(dragged.gridX, bestY.other.gridX);
    const x2 = Math.max(dragged.gridX + dragged.gridW, bestY.other.gridX + bestY.other.gridW);
    hLines.push({ orientation: "h", pos: bestY.value, from: x1 - 2, to: x2 + 2 });
  }
  return { gridX, gridY, vLines, hLines };
}

/** Snap the dragged rect's gap to a neighbor so it equals an existing,
 *  already-consistent gap elsewhere in the same row — or centers evenly
 *  between two flanking booths. */
function computeRowSpacingSnap(dragged: Rect, others: FloorBooth[]) {
  const row = others
    .filter((o) => rangesOverlap(dragged.gridY, dragged.gridY + dragged.gridH, o.gridY, o.gridY + o.gridH))
    .sort((a, b) => a.gridX - b.gridX);
  if (row.length === 0) return {} as { gridX?: number };
  let leftIdx = -1;
  for (let i = 0; i < row.length; i++) {
    if (row[i].gridX + row[i].gridW <= dragged.gridX + dragged.gridW / 2) leftIdx = i;
  }
  const left = leftIdx >= 0 ? row[leftIdx] : null;
  const right = leftIdx + 1 < row.length ? row[leftIdx + 1] : null;
  const leftOfLeft = leftIdx - 1 >= 0 ? row[leftIdx - 1] : null;
  const rightOfRight = leftIdx + 2 < row.length ? row[leftIdx + 2] : null;

  if (left && leftOfLeft) {
    const refGap = left.gridX - (leftOfLeft.gridX + leftOfLeft.gridW);
    const curGap = dragged.gridX - (left.gridX + left.gridW);
    if (refGap > 0.1 && Math.abs(curGap - refGap) <= SPACING_TOLERANCE) {
      return { gridX: left.gridX + left.gridW + refGap };
    }
  }
  if (right && rightOfRight) {
    const refGap = rightOfRight.gridX - (right.gridX + right.gridW);
    const curGap = right.gridX - (dragged.gridX + dragged.gridW);
    if (refGap > 0.1 && Math.abs(curGap - refGap) <= SPACING_TOLERANCE) {
      return { gridX: right.gridX - dragged.gridW - refGap };
    }
  }
  if (left && right) {
    const avail = right.gridX - (left.gridX + left.gridW);
    const gap = (avail - dragged.gridW) / 2;
    if (gap > 0.1) {
      const curGapLeft = dragged.gridX - (left.gridX + left.gridW);
      const curGapRight = right.gridX - (dragged.gridX + dragged.gridW);
      if (Math.abs(curGapLeft - gap) <= SPACING_TOLERANCE || Math.abs(curGapRight - gap) <= SPACING_TOLERANCE) {
        return { gridX: left.gridX + left.gridW + gap };
      }
    }
  }
  return {} as { gridX?: number };
}

/** Same as computeRowSpacingSnap but along the vertical (column) axis. */
function computeColumnSpacingSnap(dragged: Rect, others: FloorBooth[]) {
  const col = others
    .filter((o) => rangesOverlap(dragged.gridX, dragged.gridX + dragged.gridW, o.gridX, o.gridX + o.gridW))
    .sort((a, b) => a.gridY - b.gridY);
  if (col.length === 0) return {} as { gridY?: number };
  let topIdx = -1;
  for (let i = 0; i < col.length; i++) {
    if (col[i].gridY + col[i].gridH <= dragged.gridY + dragged.gridH / 2) topIdx = i;
  }
  const top = topIdx >= 0 ? col[topIdx] : null;
  const bottom = topIdx + 1 < col.length ? col[topIdx + 1] : null;
  const topOfTop = topIdx - 1 >= 0 ? col[topIdx - 1] : null;
  const bottomOfBottom = topIdx + 2 < col.length ? col[topIdx + 2] : null;

  if (top && topOfTop) {
    const refGap = top.gridY - (topOfTop.gridY + topOfTop.gridH);
    const curGap = dragged.gridY - (top.gridY + top.gridH);
    if (refGap > 0.1 && Math.abs(curGap - refGap) <= SPACING_TOLERANCE) {
      return { gridY: top.gridY + top.gridH + refGap };
    }
  }
  if (bottom && bottomOfBottom) {
    const refGap = bottomOfBottom.gridY - (bottom.gridY + bottom.gridH);
    const curGap = bottom.gridY - (dragged.gridY + dragged.gridH);
    if (refGap > 0.1 && Math.abs(curGap - refGap) <= SPACING_TOLERANCE) {
      return { gridY: bottom.gridY - dragged.gridH - refGap };
    }
  }
  if (top && bottom) {
    const avail = bottom.gridY - (top.gridY + top.gridH);
    const gap = (avail - dragged.gridH) / 2;
    if (gap > 0.1) {
      const curGapTop = dragged.gridY - (top.gridY + top.gridH);
      const curGapBottom = bottom.gridY - (dragged.gridY + dragged.gridH);
      if (Math.abs(curGapTop - gap) <= SPACING_TOLERANCE || Math.abs(curGapBottom - gap) <= SPACING_TOLERANCE) {
        return { gridY: top.gridY + top.gridH + gap };
      }
    }
  }
  return {} as { gridY?: number };
}

/** Snaps a candidate rect (a single booth, or a whole selection's bounding
 *  box) against `others`, applying alignment guides, equal-spacing guides,
 *  and/or grid snap per the given toggles — shared by single- and
 *  group-move so a group snaps as one rigid shape, not booth-by-booth. */
function computeSnappedPosition(
  raw: Rect,
  others: FloorBooth[],
  smartGuidesEnabled: boolean,
  gridSnapEnabled: boolean,
  venueWidthM: number | null | undefined
): { gridX: number; gridY: number; guides: Guides | null } {
  let gridX = raw.gridX;
  let gridY = raw.gridY;
  const vLines: GuideLine[] = [];
  const hLines: GuideLine[] = [];
  const labels: GuideLabel[] = [];
  let snappedX = false;
  let snappedY = false;

  if (smartGuidesEnabled) {
    const align = computeAlignmentSnap({ gridX, gridY, gridW: raw.gridW, gridH: raw.gridH }, others);
    if (align.gridX != null) {
      gridX = align.gridX;
      snappedX = true;
      vLines.push(...align.vLines);
    }
    if (align.gridY != null) {
      gridY = align.gridY;
      snappedY = true;
      hLines.push(...align.hLines);
    }
    if (!snappedX) {
      const rowSnap = computeRowSpacingSnap({ gridX, gridY, gridW: raw.gridW, gridH: raw.gridH }, others);
      if (rowSnap.gridX != null) {
        gridX = rowSnap.gridX;
        snappedX = true;
      }
    }
    if (!snappedY) {
      const colSnap = computeColumnSpacingSnap({ gridX, gridY, gridW: raw.gridW, gridH: raw.gridH }, others);
      if (colSnap.gridY != null) {
        gridY = colSnap.gridY;
        snappedY = true;
      }
    }
  }

  if (gridSnapEnabled) {
    if (!snappedX) gridX = Math.round(gridX / GRID_SIZE) * GRID_SIZE;
    if (!snappedY) gridY = Math.round(gridY / GRID_SIZE) * GRID_SIZE;
  }

  gridX = Math.min(100 - raw.gridW, Math.max(0, gridX));
  gridY = Math.min(100 - raw.gridH, Math.max(0, gridY));

  if (smartGuidesEnabled) {
    const midY = gridY + raw.gridH / 2;
    const row = others
      .filter((o) => rangesOverlap(gridY, gridY + raw.gridH, o.gridY, o.gridY + o.gridH))
      .sort((a, c) => a.gridX - c.gridX);
    let leftIdx = -1;
    for (let i = 0; i < row.length; i++) {
      if (row[i].gridX + row[i].gridW <= gridX + raw.gridW / 2) leftIdx = i;
    }
    const leftN = leftIdx >= 0 ? row[leftIdx] : null;
    const rightN = leftIdx + 1 < row.length ? row[leftIdx + 1] : null;
    if (leftN) {
      const gap = gridX - (leftN.gridX + leftN.gridW);
      if (gap > 0.1) labels.push({ x: leftN.gridX + leftN.gridW + gap / 2, y: midY, text: formatDistance(gap, venueWidthM) });
    }
    if (rightN) {
      const gap = rightN.gridX - (gridX + raw.gridW);
      if (gap > 0.1) labels.push({ x: gridX + raw.gridW + gap / 2, y: midY, text: formatDistance(gap, venueWidthM) });
    }

    const midX = gridX + raw.gridW / 2;
    const col = others
      .filter((o) => rangesOverlap(gridX, gridX + raw.gridW, o.gridX, o.gridX + o.gridW))
      .sort((a, c) => a.gridY - c.gridY);
    let topIdx = -1;
    for (let i = 0; i < col.length; i++) {
      if (col[i].gridY + col[i].gridH <= gridY + raw.gridH / 2) topIdx = i;
    }
    const topN = topIdx >= 0 ? col[topIdx] : null;
    const botN = topIdx + 1 < col.length ? col[topIdx + 1] : null;
    if (topN) {
      const gap = gridY - (topN.gridY + topN.gridH);
      if (gap > 0.1) labels.push({ x: midX, y: topN.gridY + topN.gridH + gap / 2, text: formatDistance(gap, venueWidthM) });
    }
    if (botN) {
      const gap = botN.gridY - (gridY + raw.gridH);
      if (gap > 0.1) labels.push({ x: midX, y: gridY + raw.gridH + gap / 2, text: formatDistance(gap, venueWidthM) });
    }
  }

  const guides = smartGuidesEnabled && (vLines.length || hLines.length || labels.length) ? { vLines, hLines, labels } : null;
  return { gridX, gridY, guides };
}

function boundingBoxOf(members: { startGridX: number; startGridY: number; gridW: number; gridH: number }[]): Rect {
  const minX = Math.min(...members.map((m) => m.startGridX));
  const minY = Math.min(...members.map((m) => m.startGridY));
  const maxX = Math.max(...members.map((m) => m.startGridX + m.gridW));
  const maxY = Math.max(...members.map((m) => m.startGridY + m.gridH));
  return { gridX: minX, gridY: minY, gridW: maxX - minX, gridH: maxY - minY };
}

const featureLabel: Record<string, string> = {
  ENTRANCE_MAIN: "Main entrance",
  ENTRANCE_SIDE: "Side entrance",
  TOILET_FEMALE: "Female toilets",
  TOILET_MALE: "Male toilets",
  OFFICE: "Office",
  LOADING: "Loading area",
  STAIRS: "Stairs to mezzanine",
  OTHER: "",
};

const statusFill: Record<string, string> = {
  AVAILABLE: "", // uses size color
  HELD: "#E9C46A",
  RESERVED: "#9CA3AF",
  SOLD: "#6B7280",
};

type BoothPatch = Partial<{ gridX: number; gridY: number; gridW: number; gridH: number; rotation: number }>;

type ResizeHandle = "nw" | "ne" | "sw" | "se";

type MoveMember = { id: string; startGridX: number; startGridY: number; gridW: number; gridH: number };

type Manip =
  | { kind: "move"; originId: string; members: MoveMember[]; groupRect: Rect; startPointer: { x: number; y: number }; moved: boolean }
  | { kind: "resize"; id: string; handle: ResizeHandle; anchorWorld: { x: number; y: number }; rotation: number; moved: boolean }
  | { kind: "rotate"; id: string; center: { x: number; y: number }; moved: boolean };

export function FloorPlan({
  features,
  booths,
  sizeStyles,
  selectedBoothId,
  onSelectBooth,
  onDeselect,
  interactive = true,
  allowAnyStatusClick = false,
  backgroundImageUrl,
  placementMode = false,
  onCanvasClick,
  editable = false,
  onBoothCommit,
  selectedIds,
  onSelectionChange,
  onGroupCommit,
  onDeleteSelected,
  onDuplicateSelected,
  smartGuidesEnabled = false,
  gridSnapEnabled = false,
  venueWidthM,
  highlightedBoothId,
  onHoverBooth,
  focusBoothId,
  focusNonce,
}: {
  features: FloorFeature[];
  booths: FloorBooth[];
  sizeStyles: Record<string, SizeStyle>;
  selectedBoothId?: string | null;
  onSelectBooth?: (booth: FloorBooth) => void;
  /** Called when the admin clicks empty canvas (not a booth) — clears the
   *  current selection, same as clicking empty space in Figma/Slides. */
  onDeselect?: () => void;
  interactive?: boolean;
  allowAnyStatusClick?: boolean;
  /** URL of a real venue photo/drawing to place behind the plan. */
  backgroundImageUrl?: string | null;
  /** When true, clicking empty canvas calls onCanvasClick instead of panning. */
  placementMode?: boolean;
  onCanvasClick?: (xPercent: number, yPercent: number) => void;
  /** Admin floor-plan-builder mode: the selection gets drag-to-move, corner
   *  resize handles (solo only) and a rotate handle (solo only) — like
   *  moving/resizing objects on a slide. */
  editable?: boolean;
  onBoothCommit?: (id: string, patch: BoothPatch) => void;
  /** Multi-select mode (admin only): current selection. Passing this (even
   *  an empty Set) switches the canvas from the plain single-pick API
   *  (selectedBoothId/onSelectBooth) to full Figma-style multi-select:
   *  click/shift-click, rubber-band drag-select, group move, keyboard
   *  shortcuts (Cmd/Ctrl+A, arrows, Escape, Delete, Cmd/Ctrl+D). */
  selectedIds?: Set<string>;
  onSelectionChange?: (ids: Set<string>) => void;
  /** Called once a group-move (drag or arrow-key nudge) finishes, with each
   *  moved booth's final position. */
  onGroupCommit?: (patches: { id: string; gridX: number; gridY: number }[]) => void;
  /** Delete/Backspace with a selection active. */
  onDeleteSelected?: () => void;
  /** Cmd/Ctrl+D with a selection active. */
  onDuplicateSelected?: () => void;
  /** While moving, snap to other booths' edges/centers and equal spacing,
   *  showing Figma/Canva-style guide lines and gap distances. Applies to
   *  the whole selection's bounding box when moving a group, so relative
   *  spacing within the group never changes. */
  smartGuidesEnabled?: boolean;
  /** While moving, snap position to a fixed percentage grid. */
  gridSnapEnabled?: boolean;
  /** Real venue width in meters — when set, distance labels while dragging
   *  show real meters instead of a raw canvas percentage. */
  venueWidthM?: number | null;
  /** External hover state — set by a paired list UI (e.g. a booth list
   *  panel) so hovering a row highlights the matching booth here too.
   *  Purely additive to the map's own internal pointer-hover; never
   *  conflicts with it. */
  highlightedBoothId?: string | null;
  /** Fires whenever the map's own pointer hover changes (enter/leave a
   *  clickable booth) — lets a paired list UI mirror the highlight back
   *  the other direction. Read-only signal; never drives this component. */
  onHoverBooth?: (id: string | null) => void;
  /** When set to a booth id present in `booths`, pans/zooms the view to
   *  center that booth once — e.g. picking a booth from a paired list.
   *  Never fights a subsequent manual pan/zoom, and re-centers again if
   *  the same booth is re-selected after being cleared. */
  focusBoothId?: string | null;
  /** Bump this (any changed number) to force a re-center on the SAME
   *  focusBoothId — needed when the map was hidden (e.g. `display:none`
   *  behind a mobile List/Map toggle) at the moment focusBoothId was set,
   *  since a hidden container measures as zero-sized and the first attempt
   *  is a no-op. */
  focusNonce?: number;
}) {
  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const [hoveredBoothId, setHoveredBoothId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const lastFocusedBoothRef = useRef<string | null>(null);
  const [preview, setPreview] = useState<Record<string, BoothPatch>>({});
  const [guides, setGuides] = useState<Guides | null>(null);
  const [rubberBand, setRubberBand] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const dragState = useRef<{ x: number; y: number; startTranslate: { x: number; y: number }; moved: boolean } | null>(null);
  const rubberBandRef = useRef<{ start: { x: number; y: number }; additive: boolean } | null>(null);
  const pinchState = useRef<{ dist: number; scale: number } | null>(null);
  const manipRef = useRef<Manip | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const multiSelectMode = selectedIds !== undefined;

  const clampScale = (s: number) => Math.min(4, Math.max(0.5, s));

  const pointToPercent = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const loc = pt.matrixTransform(ctm.inverse());
    return { x: Math.min(100, Math.max(0, loc.x)), y: Math.min(100, Math.max(0, loc.y)) };
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      (e.target as Element).setPointerCapture?.(e.pointerId);
      if (multiSelectMode && editable && !placementMode) {
        const pct = pointToPercent(e.clientX, e.clientY);
        if (pct) {
          rubberBandRef.current = { start: pct, additive: e.shiftKey || e.metaKey || e.ctrlKey };
          setRubberBand({ x1: pct.x, y1: pct.y, x2: pct.x, y2: pct.y });
          return;
        }
      }
      dragState.current = { x: e.clientX, y: e.clientY, startTranslate: translate, moved: false };
    },
    [translate, multiSelectMode, editable, placementMode, pointToPercent]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (rubberBandRef.current) {
        const pct = pointToPercent(e.clientX, e.clientY);
        if (pct) setRubberBand({ x1: rubberBandRef.current.start.x, y1: rubberBandRef.current.start.y, x2: pct.x, y2: pct.y });
        return;
      }
      if (!dragState.current) return;
      const dx = e.clientX - dragState.current.x;
      const dy = e.clientY - dragState.current.y;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragState.current.moved = true;
      setTranslate({ x: dragState.current.startTranslate.x + dx, y: dragState.current.startTranslate.y + dy });
    },
    [pointToPercent]
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (rubberBandRef.current) {
        const band = rubberBandRef.current;
        rubberBandRef.current = null;
        setRubberBand(null);
        const pct = pointToPercent(e.clientX, e.clientY);
        const x1 = Math.min(band.start.x, pct?.x ?? band.start.x);
        const x2 = Math.max(band.start.x, pct?.x ?? band.start.x);
        const y1 = Math.min(band.start.y, pct?.y ?? band.start.y);
        const y2 = Math.max(band.start.y, pct?.y ?? band.start.y);
        if (x2 - x1 < 0.5 && y2 - y1 < 0.5) {
          // Negligible drag — treat as an empty-canvas click, not a selection box.
          if (!band.additive) onDeselect?.();
          return;
        }
        const touched = booths.filter((b) => rangesOverlap(x1, x2, b.gridX, b.gridX + b.gridW) && rangesOverlap(y1, y2, b.gridY, b.gridY + b.gridH));
        const next = band.additive ? new Set(selectedIds) : new Set<string>();
        touched.forEach((b) => next.add(b.id));
        onSelectionChange?.(next);
        return;
      }
      const wasClick = dragState.current && !dragState.current.moved;
      dragState.current = null;
      if (wasClick && placementMode && onCanvasClick) {
        const pct = pointToPercent(e.clientX, e.clientY);
        if (pct) onCanvasClick(pct.x, pct.y);
      } else if (wasClick && !placementMode && onDeselect) {
        // Clicked empty canvas (not a booth, which stops propagation before
        // this fires) — deselect, same as clicking empty space in Figma/Slides.
        onDeselect();
      }
    },
    [placementMode, onCanvasClick, pointToPercent, onDeselect, booths, selectedIds, onSelectionChange]
  );

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    setScale((s) => clampScale(s - e.deltaY * 0.0015));
  }, []);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const [a, b] = [e.touches[0], e.touches[1]];
      const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      pinchState.current = { dist, scale };
    }
  }, [scale]);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2 && pinchState.current) {
      const [a, b] = [e.touches[0], e.touches[1]];
      const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      const ratio = dist / pinchState.current.dist;
      setScale(clampScale(pinchState.current.scale * ratio));
    }
  }, []);

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    if (e.touches.length < 2) pinchState.current = null;
  }, []);

  // Forget the last-focused key once focusBoothId is cleared, so re-selecting
  // the SAME booth after deselecting it re-centers again instead of being
  // treated as "already focused there."
  useEffect(() => {
    if (!focusBoothId) lastFocusedBoothRef.current = null;
  }, [focusBoothId]);

  // Pans/zooms to center `focusBoothId` — fires once per (id, nonce) pair
  // (guarded by lastFocusedBoothRef), so it never fights a vendor's own
  // subsequent manual pan/zoom on that same booth. If the container measures
  // zero-sized (hidden behind a mobile List/Map toggle), it does NOT mark
  // this attempt as done, so the next re-render (or a focusNonce bump once
  // the map becomes visible) retries with a real measurement.
  useEffect(() => {
    const key = `${focusBoothId ?? ""}:${focusNonce ?? 0}`;
    if (!focusBoothId || key === lastFocusedBoothRef.current) return;
    const booth = booths.find((b) => b.id === focusBoothId);
    const el = containerRef.current;
    if (!booth || !el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return; // hidden — retry later, don't mark done
    lastFocusedBoothRef.current = key;
    const size = Math.min(rect.width, rect.height);
    const cx = booth.gridX + booth.gridW / 2;
    const cy = booth.gridY + booth.gridH / 2;
    const targetScale = clampScale(Math.max(scale, 1.6));
    const unit = (size / VIEWBOX) * targetScale;
    setScale(targetScale);
    setTranslate({ x: size / 2 - cx * unit, y: size / 2 - cy * unit });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberately re-checks on booths/scale changes but only acts once per (focusBoothId, focusNonce) pair (see lastFocusedBoothRef guard above)
  }, [focusBoothId, focusNonce, booths]);

  // ---- booth manipulation (editable mode): drag-to-move (solo or as a
  // group), corner resize handles, and a rotate handle, all operating in
  // the same 0-100 percent world space that pointToPercent already resolves
  // to (which stays correct even for a booth rendered inside a rotated <g>,
  // since getScreenCTM is read from the SVG root). ----

  const getEffective = useCallback(
    (b: FloorBooth): FloorBooth => (preview[b.id] ? { ...b, ...preview[b.id] } : b),
    [preview]
  );

  const computeGroupMovePatch = useCallback(
    (m: Extract<Manip, { kind: "move" }>, pct: { x: number; y: number }): { patches: Record<string, BoothPatch>; guides: Guides | null } => {
      const dx = pct.x - m.startPointer.x;
      const dy = pct.y - m.startPointer.y;
      let groupX = Math.min(100 - m.groupRect.gridW, Math.max(0, m.groupRect.gridX + dx));
      let groupY = Math.min(100 - m.groupRect.gridH, Math.max(0, m.groupRect.gridY + dy));

      const memberIds = new Set(m.members.map((mm) => mm.id));
      const others = booths.filter((o) => !memberIds.has(o.id));

      const snapped = computeSnappedPosition(
        { gridX: groupX, gridY: groupY, gridW: m.groupRect.gridW, gridH: m.groupRect.gridH },
        others,
        smartGuidesEnabled,
        gridSnapEnabled,
        venueWidthM
      );
      groupX = snapped.gridX;
      groupY = snapped.gridY;

      const finalDX = groupX - m.groupRect.gridX;
      const finalDY = groupY - m.groupRect.gridY;

      const patches: Record<string, BoothPatch> = {};
      for (const mem of m.members) {
        patches[mem.id] = { gridX: mem.startGridX + finalDX, gridY: mem.startGridY + finalDY };
      }
      return { patches, guides: snapped.guides };
    },
    [booths, smartGuidesEnabled, gridSnapEnabled, venueWidthM]
  );

  const computeResizePatch = (m: Extract<Manip, { kind: "resize" }>, pct: { x: number; y: number }): BoothPatch => {
    const vx = pct.x - m.anchorWorld.x;
    const vy = pct.y - m.anchorWorld.y;
    const local = rotateVec(vx, vy, -m.rotation);
    const newW = Math.max(MIN_BOOTH_SIZE, Math.min(100, Math.abs(local.x)));
    const newH = Math.max(MIN_BOOTH_SIZE, Math.min(100, Math.abs(local.y)));
    const signX = m.handle === "nw" || m.handle === "sw" ? -1 : 1;
    const signY = m.handle === "nw" || m.handle === "ne" ? -1 : 1;
    const centerLocalOffset = { x: (signX * newW) / 2, y: (signY * newH) / 2 };
    const centerWorldOffset = rotateVec(centerLocalOffset.x, centerLocalOffset.y, m.rotation);
    const cx = m.anchorWorld.x + centerWorldOffset.x;
    const cy = m.anchorWorld.y + centerWorldOffset.y;
    return { gridX: cx - newW / 2, gridY: cy - newH / 2, gridW: newW, gridH: newH };
  };

  const computeRotatePatch = (m: Extract<Manip, { kind: "rotate" }>, pct: { x: number; y: number }): BoothPatch => {
    const angleRad = Math.atan2(pct.y - m.center.y, pct.x - m.center.x);
    let deg = (angleRad * 180) / Math.PI + 90; // the handle sits above center at rotation 0
    deg = ((deg % 360) + 360) % 360;
    const snapped = Math.round(deg / 15) * 15;
    const diff = Math.abs(deg - snapped);
    if (Math.min(diff, 360 - diff) < 3) deg = snapped;
    return { rotation: Math.round(((deg % 360) + 360) % 360) };
  };

  const beginGroupMove = useCallback(
    (e: React.PointerEvent, raw: FloorBooth) => {
      e.stopPropagation();
      (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
      const pct = pointToPercent(e.clientX, e.clientY);
      if (!pct) return;
      let memberBooths: FloorBooth[];
      if (multiSelectMode && selectedIds!.has(raw.id) && selectedIds!.size > 1) {
        memberBooths = booths.filter((b) => selectedIds!.has(b.id));
      } else {
        memberBooths = [raw];
        if (multiSelectMode) onSelectionChange?.(new Set([raw.id]));
      }
      const members: MoveMember[] = memberBooths.map((b) => ({ id: b.id, startGridX: b.gridX, startGridY: b.gridY, gridW: b.gridW, gridH: b.gridH }));
      manipRef.current = {
        kind: "move",
        originId: raw.id,
        members,
        groupRect: boundingBoxOf(members),
        startPointer: pct,
        moved: false,
      };
    },
    [pointToPercent, multiSelectMode, selectedIds, booths, onSelectionChange]
  );

  const beginResize = useCallback((e: React.PointerEvent, b: FloorBooth, handle: ResizeHandle) => {
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    const rotation = b.rotation || 0;
    const cx = b.gridX + b.gridW / 2;
    const cy = b.gridY + b.gridH / 2;
    const anchorLocal = {
      nw: { x: b.gridW / 2, y: b.gridH / 2 },
      ne: { x: -b.gridW / 2, y: b.gridH / 2 },
      sw: { x: b.gridW / 2, y: -b.gridH / 2 },
      se: { x: -b.gridW / 2, y: -b.gridH / 2 },
    }[handle];
    const rotated = rotateVec(anchorLocal.x, anchorLocal.y, rotation);
    manipRef.current = {
      kind: "resize",
      id: b.id,
      handle,
      anchorWorld: { x: cx + rotated.x, y: cy + rotated.y },
      rotation,
      moved: false,
    };
  }, []);

  const beginRotate = useCallback((e: React.PointerEvent, b: FloorBooth) => {
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    manipRef.current = {
      kind: "rotate",
      id: b.id,
      center: { x: b.gridX + b.gridW / 2, y: b.gridY + b.gridH / 2 },
      moved: false,
    };
  }, []);

  const onManipPointerMove = useCallback(
    (e: React.PointerEvent, b: FloorBooth) => {
      const m = manipRef.current;
      if (!m) return;
      if (m.kind === "move" ? m.originId !== b.id : m.id !== b.id) return;
      e.stopPropagation();
      const pct = pointToPercent(e.clientX, e.clientY);
      if (!pct) return;
      m.moved = true;
      if (m.kind === "move") {
        const { patches, guides: nextGuides } = computeGroupMovePatch(m, pct);
        setPreview(patches);
        setGuides(nextGuides);
      } else {
        const patch = m.kind === "resize" ? computeResizePatch(m, pct) : computeRotatePatch(m, pct);
        setPreview({ [b.id]: patch });
      }
    },
    [pointToPercent, computeGroupMovePatch]
  );

  const onManipPointerUp = useCallback(
    (e: React.PointerEvent, b: FloorBooth) => {
      const m = manipRef.current;
      if (!m) return;
      if (m.kind === "move" ? m.originId !== b.id : m.id !== b.id) return;
      e.stopPropagation();
      manipRef.current = null;
      setPreview({});
      setGuides(null);
      if (!m.moved) return;
      const pct = pointToPercent(e.clientX, e.clientY);
      if (!pct) return;
      if (m.kind === "move") {
        const { patches } = computeGroupMovePatch(m, pct);
        onGroupCommit?.(Object.entries(patches).map(([id, patch]) => ({ id, gridX: patch.gridX!, gridY: patch.gridY! })));
      } else {
        const patch = m.kind === "resize" ? computeResizePatch(m, pct) : computeRotatePatch(m, pct);
        onBoothCommit?.(b.id, patch);
      }
    },
    [pointToPercent, onBoothCommit, onGroupCommit, computeGroupMovePatch]
  );

  // ---- keyboard shortcuts (multi-select mode only): Cmd/Ctrl+A select
  // all, arrows nudge the selection, Escape clears it, Delete/Backspace and
  // Cmd/Ctrl+D delegate to the builder's delete/duplicate. ----
  useEffect(() => {
    if (!multiSelectMode || !editable) return;
    function onKeyDown(e: KeyboardEvent) {
      if (isTypingTarget(e.target)) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "a") {
        e.preventDefault();
        onSelectionChange?.(new Set(booths.map((b) => b.id)));
        return;
      }
      if (mod && e.key.toLowerCase() === "d") {
        if (selectedIds && selectedIds.size > 0) {
          e.preventDefault();
          onDuplicateSelected?.();
        }
        return;
      }
      if (e.key === "Escape") {
        onSelectionChange?.(new Set());
        return;
      }
      if ((e.key === "Delete" || e.key === "Backspace") && selectedIds && selectedIds.size > 0) {
        e.preventDefault();
        onDeleteSelected?.();
        return;
      }
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key) && selectedIds && selectedIds.size > 0) {
        e.preventDefault();
        const amount = e.shiftKey ? NUDGE_AMOUNT_BIG : NUDGE_AMOUNT;
        const dx = e.key === "ArrowLeft" ? -amount : e.key === "ArrowRight" ? amount : 0;
        const dy = e.key === "ArrowUp" ? -amount : e.key === "ArrowDown" ? amount : 0;
        const members = booths.filter((b) => selectedIds.has(b.id));
        if (members.length === 0) return;
        const box = boundingBoxOf(members.map((b) => ({ startGridX: b.gridX, startGridY: b.gridY, gridW: b.gridW, gridH: b.gridH })));
        const clampedX = Math.min(100 - box.gridW, Math.max(0, box.gridX + dx));
        const clampedY = Math.min(100 - box.gridH, Math.max(0, box.gridY + dy));
        const finalDX = clampedX - box.gridX;
        const finalDY = clampedY - box.gridY;
        onGroupCommit?.(members.map((b) => ({ id: b.id, gridX: b.gridX + finalDX, gridY: b.gridY + finalDY })));
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [multiSelectMode, editable, booths, selectedIds, onSelectionChange, onGroupCommit, onDeleteSelected, onDuplicateSelected]);

  return (
    <div className="rounded-xl border border-brown/15 bg-cream-soft overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-brown/10 text-xs text-brown-light">
        <span>
          {placementMode
            ? "Click the map to place a booth"
            : multiSelectMode
            ? "Click, shift-click or drag a selection box to pick booths — drag one to move the group"
            : editable
            ? "Drag a booth to move it, corners to resize, top handle to rotate"
            : interactive
            ? "Drag to pan, scroll or pinch to zoom"
            : "Preview"}
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setScale((s) => clampScale(s - 0.2))}
            className="w-7 h-7 rounded-full border border-brown/30 hover:bg-brown/10"
          >
            −
          </button>
          <button
            type="button"
            onClick={() => {
              setScale(1);
              setTranslate({ x: 0, y: 0 });
            }}
            className="w-7 h-7 rounded-full border border-brown/30 hover:bg-brown/10 text-[10px]"
          >
            ⤾
          </button>
          <button
            type="button"
            onClick={() => setScale((s) => clampScale(s + 0.2))}
            className="w-7 h-7 rounded-full border border-brown/30 hover:bg-brown/10"
          >
            +
          </button>
        </div>
      </div>

      <div
        ref={containerRef}
        className={`relative w-full aspect-square max-h-[70vh] overflow-hidden touch-none ${
          placementMode ? "cursor-crosshair" : multiSelectMode ? "cursor-default" : "cursor-grab active:cursor-grabbing"
        } ${!backgroundImageUrl ? "bg-[repeating-linear-gradient(45deg,rgba(107,68,41,0.03),rgba(107,68,41,0.03)_10px,transparent_10px,transparent_20px)]" : ""}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        onWheel={onWheel}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <svg
          ref={svgRef}
          width="100%"
          height="100%"
          viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`}
          preserveAspectRatio="xMidYMid meet"
          style={{
            transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale})`,
            transformOrigin: "0 0",
          }}
        >
          <rect x={0} y={0} width={VIEWBOX} height={VIEWBOX} fill="transparent" stroke="#DDD3C3" strokeWidth={0.3} />

          {backgroundImageUrl && (
            <image href={backgroundImageUrl} x={0} y={0} width={VIEWBOX} height={VIEWBOX} preserveAspectRatio="none" />
          )}

          {features.map((f) => (
            <g key={f.id}>
              <rect
                x={f.gridX}
                y={f.gridY}
                width={f.gridW}
                height={f.gridH}
                fill={backgroundImageUrl ? "rgba(227,217,204,0.75)" : "#E3D9CC"}
                stroke="#B79A7C"
                strokeWidth={0.15}
                strokeDasharray={f.type.startsWith("ENTRANCE") ? "1 0.7" : undefined}
              />
              <text
                x={f.gridX + f.gridW / 2}
                y={f.gridY + f.gridH / 2}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={2.2}
                fill="#6B4429"
              >
                {f.label || featureLabel[f.type]}
              </text>
            </g>
          ))}

          {booths.map((raw) => {
            const b = getEffective(raw);
            const style = sizeStyles[b.size] || { color: "#B58A63", label: b.size };
            const baseColor = b.colorHex || style.color;
            const isSelected = multiSelectMode ? (selectedIds?.has(b.id) ?? false) : selectedBoothId === b.id;
            const isSoleSelected = multiSelectMode ? selectedIds?.size === 1 && selectedIds.has(b.id) : isSelected;
            const isGroupSelected = multiSelectMode && isSelected && (selectedIds?.size ?? 0) > 1;
            const isHovered = hoveredBoothId === b.id || highlightedBoothId === b.id;
            const fill = b.status === "AVAILABLE" ? baseColor : statusFill[b.status] || baseColor;
            const clickable = interactive && !placementMode && (allowAnyStatusClick || b.status === "AVAILABLE" || b.isMine);
            const canManipulate = editable && clickable;
            const rotation = b.rotation || 0;
            const cx = b.gridX + b.gridW / 2;
            const cy = b.gridY + b.gridH / 2;
            const isBeingManipulated = preview[b.id] != null;

            return (
              <g key={b.id} transform={rotation ? `rotate(${rotation} ${cx} ${cy})` : undefined}>
                <g
                  onClick={(e) => {
                    if (!clickable) return;
                    e.stopPropagation();
                    if (multiSelectMode) {
                      if (e.shiftKey || e.metaKey || e.ctrlKey) {
                        const next = new Set(selectedIds);
                        if (next.has(raw.id)) next.delete(raw.id);
                        else next.add(raw.id);
                        onSelectionChange?.(next);
                      } else {
                        onSelectionChange?.(new Set([raw.id]));
                      }
                    } else {
                      onSelectBooth?.(raw);
                    }
                  }}
                  onPointerDown={(e) => {
                    if (!canManipulate) return;
                    if (e.shiftKey || e.metaKey || e.ctrlKey) return;
                    beginGroupMove(e, raw);
                  }}
                  onPointerMove={(e) => canManipulate && onManipPointerMove(e, raw)}
                  onPointerUp={(e) => canManipulate && onManipPointerUp(e, raw)}
                  onPointerEnter={() => {
                    if (!clickable) return;
                    setHoveredBoothId(b.id);
                    onHoverBooth?.(b.id);
                  }}
                  onPointerLeave={() => {
                    setHoveredBoothId((cur) => (cur === b.id ? null : cur));
                    if (clickable) onHoverBooth?.(null);
                  }}
                  style={{
                    cursor: canManipulate ? "move" : clickable ? "pointer" : "default",
                    touchAction: canManipulate ? "none" : undefined,
                  }}
                >
                  <rect
                    x={b.gridX}
                    y={b.gridY}
                    width={b.gridW}
                    height={b.gridH}
                    rx={0.5}
                    ry={0.5}
                    fill={isGroupSelected ? shadeColor(fill, -20) : clickable && isHovered ? shadeColor(fill, -30) : fill}
                    opacity={b.status === "SOLD" ? 0.6 : backgroundImageUrl ? 0.85 : 1}
                    stroke={isGroupSelected ? "#2563EB" : isSelected || b.isMine ? "#2E7D32" : clickable && isHovered ? "#FBF8F3" : "#3A2417"}
                    strokeWidth={isSelected || b.isMine ? 0.6 : clickable && isHovered ? 0.45 : 0.15}
                    style={{ transition: isBeingManipulated ? "none" : "fill 0.15s ease, stroke 0.15s ease, stroke-width 0.15s ease" }}
                  />
                  <text
                    x={cx}
                    y={cy}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize={2.4}
                    fontWeight={600}
                    fill="#FBF8F3"
                    style={{ pointerEvents: "none" }}
                  >
                    {b.code}
                  </text>
                </g>

                {editable && isSoleSelected && (
                  <>
                    {(["nw", "ne", "sw", "se"] as const).map((h) => {
                      const hx = h.includes("w") ? b.gridX : b.gridX + b.gridW;
                      const hy = h.includes("n") ? b.gridY : b.gridY + b.gridH;
                      return (
                        <rect
                          key={h}
                          x={hx - 1.1}
                          y={hy - 1.1}
                          width={2.2}
                          height={2.2}
                          rx={0.3}
                          fill="#FBF8F3"
                          stroke="#2E7D32"
                          strokeWidth={0.4}
                          style={{ cursor: h === "nw" || h === "se" ? "nwse-resize" : "nesw-resize", touchAction: "none" }}
                          onPointerDown={(e) => beginResize(e, raw, h)}
                          onPointerMove={(e) => onManipPointerMove(e, raw)}
                          onPointerUp={(e) => onManipPointerUp(e, raw)}
                        />
                      );
                    })}
                    <line
                      x1={cx}
                      y1={b.gridY}
                      x2={cx}
                      y2={b.gridY - ROTATE_HANDLE_OFFSET}
                      stroke="#2E7D32"
                      strokeWidth={0.3}
                    />
                    <circle
                      cx={cx}
                      cy={b.gridY - ROTATE_HANDLE_OFFSET}
                      r={1.4}
                      fill="#FBF8F3"
                      stroke="#2E7D32"
                      strokeWidth={0.4}
                      style={{ cursor: "grab", touchAction: "none" }}
                      onPointerDown={(e) => beginRotate(e, raw)}
                      onPointerMove={(e) => onManipPointerMove(e, raw)}
                      onPointerUp={(e) => onManipPointerUp(e, raw)}
                    />
                  </>
                )}
              </g>
            );
          })}

          {guides && (
            <g style={{ pointerEvents: "none" }}>
              {guides.vLines.map((l, i) => (
                <line key={`v${i}`} x1={l.pos} y1={l.from} x2={l.pos} y2={l.to} stroke="#EC4899" strokeWidth={0.25} strokeDasharray="1 0.6" />
              ))}
              {guides.hLines.map((l, i) => (
                <line key={`h${i}`} x1={l.from} y1={l.pos} x2={l.to} y2={l.pos} stroke="#EC4899" strokeWidth={0.25} strokeDasharray="1 0.6" />
              ))}
              {guides.labels.map((lb, i) => {
                const w = Math.max(4, lb.text.length * 1.4);
                return (
                  <g key={`lb${i}`}>
                    <rect x={lb.x - w / 2} y={lb.y - 1.3} width={w} height={2.4} rx={0.6} fill="#1F2937" opacity={0.9} />
                    <text x={lb.x} y={lb.y} textAnchor="middle" dominantBaseline="middle" fontSize={1.6} fill="#fff">
                      {lb.text}
                    </text>
                  </g>
                );
              })}
            </g>
          )}

          {rubberBand && (
            <rect
              x={Math.min(rubberBand.x1, rubberBand.x2)}
              y={Math.min(rubberBand.y1, rubberBand.y2)}
              width={Math.abs(rubberBand.x2 - rubberBand.x1)}
              height={Math.abs(rubberBand.y2 - rubberBand.y1)}
              fill="rgba(37,99,235,0.12)"
              stroke="#2563EB"
              strokeWidth={0.25}
              strokeDasharray="1 0.6"
              style={{ pointerEvents: "none" }}
            />
          )}
        </svg>
      </div>
    </div>
  );
}
