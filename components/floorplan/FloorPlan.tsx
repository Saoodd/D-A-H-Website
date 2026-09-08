"use client";

import { useRef, useState, useCallback } from "react";
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

/** Snap the dragged booth's gap to a neighbor so it equals an existing,
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

type Manip =
  | { kind: "move"; id: string; startPointer: { x: number; y: number }; startGrid: { gridX: number; gridY: number }; moved: boolean }
  | { kind: "resize"; id: string; handle: ResizeHandle; anchorWorld: { x: number; y: number }; rotation: number; moved: boolean }
  | { kind: "rotate"; id: string; center: { x: number; y: number }; moved: boolean };

export function FloorPlan({
  features,
  booths,
  sizeStyles,
  selectedBoothId,
  onSelectBooth,
  interactive = true,
  allowAnyStatusClick = false,
  backgroundImageUrl,
  placementMode = false,
  onCanvasClick,
  editable = false,
  onBoothCommit,
  multiSelectedIds,
  smartGuidesEnabled = false,
  gridSnapEnabled = false,
  venueWidthM,
}: {
  features: FloorFeature[];
  booths: FloorBooth[];
  sizeStyles: Record<string, SizeStyle>;
  selectedBoothId?: string | null;
  onSelectBooth?: (booth: FloorBooth) => void;
  interactive?: boolean;
  allowAnyStatusClick?: boolean;
  /** URL of a real venue photo/drawing to place behind the plan. */
  backgroundImageUrl?: string | null;
  /** When true, clicking empty canvas calls onCanvasClick instead of panning. */
  placementMode?: boolean;
  onCanvasClick?: (xPercent: number, yPercent: number) => void;
  /** Admin floor-plan-builder mode: the selected booth gets drag-to-move,
   *  corner resize handles, and a rotate handle — like moving/resizing an
   *  object on a slide. */
  editable?: boolean;
  onBoothCommit?: (id: string, patch: BoothPatch) => void;
  /** When set, booths whose id is in this set render with a distinct
   *  checked/highlighted look — used for the bulk multi-select price tool. */
  multiSelectedIds?: Set<string>;
  /** While moving a booth, snap to other booths' edges/centers and equal
   *  spacing, showing Figma/Canva-style guide lines and gap distances. */
  smartGuidesEnabled?: boolean;
  /** While moving a booth, snap its position to a fixed percentage grid. */
  gridSnapEnabled?: boolean;
  /** Real venue width in meters — when set, distance labels while dragging
   *  show real meters instead of a raw canvas percentage. */
  venueWidthM?: number | null;
}) {
  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const [hoveredBoothId, setHoveredBoothId] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ id: string; data: BoothPatch } | null>(null);
  const [guides, setGuides] = useState<Guides | null>(null);
  const dragState = useRef<{ x: number; y: number; startTranslate: { x: number; y: number }; moved: boolean } | null>(null);
  const pinchState = useRef<{ dist: number; scale: number } | null>(null);
  const manipRef = useRef<Manip | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

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

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    dragState.current = { x: e.clientX, y: e.clientY, startTranslate: translate, moved: false };
  }, [translate]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragState.current) return;
    const dx = e.clientX - dragState.current.x;
    const dy = e.clientY - dragState.current.y;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragState.current.moved = true;
    setTranslate({ x: dragState.current.startTranslate.x + dx, y: dragState.current.startTranslate.y + dy });
  }, []);

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      const wasClick = dragState.current && !dragState.current.moved;
      dragState.current = null;
      if (wasClick && placementMode && onCanvasClick) {
        const pct = pointToPercent(e.clientX, e.clientY);
        if (pct) onCanvasClick(pct.x, pct.y);
      }
    },
    [placementMode, onCanvasClick, pointToPercent]
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

  // ---- booth manipulation (editable mode): drag-to-move, corner resize
  // handles, and a rotate handle, all operating in the same 0-100 percent
  // world space that pointToPercent already resolves to (which stays
  // correct even for a booth rendered inside a rotated <g>, since
  // getScreenCTM is read from the SVG root). ----

  const getEffective = useCallback(
    (b: FloorBooth): FloorBooth => (preview && preview.id === b.id ? { ...b, ...preview.data } : b),
    [preview]
  );

  const computeMovePatch = useCallback((
    m: Extract<Manip, { kind: "move" }>,
    pct: { x: number; y: number },
    b: FloorBooth
  ): { patch: BoothPatch; guides: Guides | null } => {
    const dx = pct.x - m.startPointer.x;
    const dy = pct.y - m.startPointer.y;
    let gridX = Math.min(100 - b.gridW, Math.max(0, m.startGrid.gridX + dx));
    let gridY = Math.min(100 - b.gridH, Math.max(0, m.startGrid.gridY + dy));

    const others = booths.filter((o) => o.id !== b.id);
    const vLines: GuideLine[] = [];
    const hLines: GuideLine[] = [];
    const labels: GuideLabel[] = [];
    let snappedX = false;
    let snappedY = false;

    if (smartGuidesEnabled) {
      const align = computeAlignmentSnap({ gridX, gridY, gridW: b.gridW, gridH: b.gridH }, others);
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
        const rowSnap = computeRowSpacingSnap({ gridX, gridY, gridW: b.gridW, gridH: b.gridH }, others);
        if (rowSnap.gridX != null) {
          gridX = rowSnap.gridX;
          snappedX = true;
        }
      }
      if (!snappedY) {
        const colSnap = computeColumnSpacingSnap({ gridX, gridY, gridW: b.gridW, gridH: b.gridH }, others);
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

    gridX = Math.min(100 - b.gridW, Math.max(0, gridX));
    gridY = Math.min(100 - b.gridH, Math.max(0, gridY));

    if (smartGuidesEnabled) {
      const midY = gridY + b.gridH / 2;
      const row = others
        .filter((o) => rangesOverlap(gridY, gridY + b.gridH, o.gridY, o.gridY + o.gridH))
        .sort((a, c) => a.gridX - c.gridX);
      let leftIdx = -1;
      for (let i = 0; i < row.length; i++) {
        if (row[i].gridX + row[i].gridW <= gridX + b.gridW / 2) leftIdx = i;
      }
      const leftN = leftIdx >= 0 ? row[leftIdx] : null;
      const rightN = leftIdx + 1 < row.length ? row[leftIdx + 1] : null;
      if (leftN) {
        const gap = gridX - (leftN.gridX + leftN.gridW);
        if (gap > 0.1) labels.push({ x: leftN.gridX + leftN.gridW + gap / 2, y: midY, text: formatDistance(gap, venueWidthM) });
      }
      if (rightN) {
        const gap = rightN.gridX - (gridX + b.gridW);
        if (gap > 0.1) labels.push({ x: gridX + b.gridW + gap / 2, y: midY, text: formatDistance(gap, venueWidthM) });
      }

      const midX = gridX + b.gridW / 2;
      const col = others
        .filter((o) => rangesOverlap(gridX, gridX + b.gridW, o.gridX, o.gridX + o.gridW))
        .sort((a, c) => a.gridY - c.gridY);
      let topIdx = -1;
      for (let i = 0; i < col.length; i++) {
        if (col[i].gridY + col[i].gridH <= gridY + b.gridH / 2) topIdx = i;
      }
      const topN = topIdx >= 0 ? col[topIdx] : null;
      const botN = topIdx + 1 < col.length ? col[topIdx + 1] : null;
      if (topN) {
        const gap = gridY - (topN.gridY + topN.gridH);
        if (gap > 0.1) labels.push({ x: midX, y: topN.gridY + topN.gridH + gap / 2, text: formatDistance(gap, venueWidthM) });
      }
      if (botN) {
        const gap = botN.gridY - (gridY + b.gridH);
        if (gap > 0.1) labels.push({ x: midX, y: gridY + b.gridH + gap / 2, text: formatDistance(gap, venueWidthM) });
      }
    }

    const nextGuides = smartGuidesEnabled && (vLines.length || hLines.length || labels.length) ? { vLines, hLines, labels } : null;
    return { patch: { gridX, gridY }, guides: nextGuides };
  }, [booths, smartGuidesEnabled, gridSnapEnabled, venueWidthM]);

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

  const beginMove = useCallback((e: React.PointerEvent, b: FloorBooth) => {
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    const pct = pointToPercent(e.clientX, e.clientY);
    if (!pct) return;
    manipRef.current = { kind: "move", id: b.id, startPointer: pct, startGrid: { gridX: b.gridX, gridY: b.gridY }, moved: false };
  }, [pointToPercent]);

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
      if (!m || m.id !== b.id) return;
      e.stopPropagation();
      const pct = pointToPercent(e.clientX, e.clientY);
      if (!pct) return;
      m.moved = true;
      if (m.kind === "move") {
        const { patch, guides: nextGuides } = computeMovePatch(m, pct, b);
        setPreview({ id: b.id, data: patch });
        setGuides(nextGuides);
      } else {
        const patch = m.kind === "resize" ? computeResizePatch(m, pct) : computeRotatePatch(m, pct);
        setPreview({ id: b.id, data: patch });
      }
    },
    [pointToPercent, computeMovePatch]
  );

  const onManipPointerUp = useCallback(
    (e: React.PointerEvent, b: FloorBooth) => {
      const m = manipRef.current;
      if (!m || m.id !== b.id) return;
      e.stopPropagation();
      manipRef.current = null;
      setPreview(null);
      setGuides(null);
      if (!m.moved) return;
      const pct = pointToPercent(e.clientX, e.clientY);
      if (!pct) return;
      const patch =
        m.kind === "move" ? computeMovePatch(m, pct, b).patch : m.kind === "resize" ? computeResizePatch(m, pct) : computeRotatePatch(m, pct);
      onBoothCommit?.(b.id, patch);
    },
    [pointToPercent, onBoothCommit, computeMovePatch]
  );

  return (
    <div className="rounded-xl border border-brown/15 bg-cream-soft overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-brown/10 text-xs text-brown-light">
        <span>
          {placementMode
            ? "Click the map to place a booth"
            : multiSelectedIds
            ? "Click booths to select them for a bulk price update"
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
        className={`relative w-full aspect-square max-h-[70vh] overflow-hidden touch-none ${
          placementMode ? "cursor-crosshair" : "cursor-grab active:cursor-grabbing"
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
            const isSelected = selectedBoothId === b.id;
            const isMultiSelected = multiSelectedIds?.has(b.id) ?? false;
            const isHovered = hoveredBoothId === b.id;
            const fill = b.status === "AVAILABLE" ? baseColor : statusFill[b.status] || baseColor;
            const clickable = interactive && !placementMode && (allowAnyStatusClick || b.status === "AVAILABLE" || b.isMine);
            const canManipulate = editable && clickable;
            const rotation = b.rotation || 0;
            const cx = b.gridX + b.gridW / 2;
            const cy = b.gridY + b.gridH / 2;
            const isBeingManipulated = preview?.id === b.id;

            return (
              <g key={b.id} transform={rotation ? `rotate(${rotation} ${cx} ${cy})` : undefined}>
                <g
                  onClick={(e) => {
                    if (!clickable) return;
                    e.stopPropagation();
                    onSelectBooth?.(raw);
                  }}
                  onPointerDown={(e) => canManipulate && beginMove(e, raw)}
                  onPointerMove={(e) => canManipulate && onManipPointerMove(e, raw)}
                  onPointerUp={(e) => canManipulate && onManipPointerUp(e, raw)}
                  onPointerEnter={() => clickable && setHoveredBoothId(b.id)}
                  onPointerLeave={() => setHoveredBoothId((cur) => (cur === b.id ? null : cur))}
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
                    fill={isMultiSelected ? shadeColor(fill, -20) : clickable && isHovered ? shadeColor(fill, -30) : fill}
                    opacity={b.status === "SOLD" ? 0.6 : backgroundImageUrl ? 0.85 : 1}
                    stroke={isMultiSelected ? "#2563EB" : isSelected || b.isMine ? "#2E7D32" : clickable && isHovered ? "#FBF8F3" : "#3A2417"}
                    strokeWidth={isMultiSelected ? 0.7 : isSelected || b.isMine ? 0.6 : clickable && isHovered ? 0.45 : 0.15}
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

                {isMultiSelected && (
                  <g style={{ pointerEvents: "none" }}>
                    <circle cx={b.gridX + 1.6} cy={b.gridY + 1.6} r={1.3} fill="#2563EB" stroke="#FBF8F3" strokeWidth={0.25} />
                    <text
                      x={b.gridX + 1.6}
                      y={b.gridY + 1.6}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fontSize={1.8}
                      fontWeight={700}
                      fill="#FBF8F3"
                    >
                      ✓
                    </text>
                  </g>
                )}

                {editable && isSelected && (
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
        </svg>
      </div>
    </div>
  );
}
