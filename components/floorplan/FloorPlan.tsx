"use client";

import { useRef, useState, useCallback, useEffect, useMemo, useId } from "react";
import { FloorFeature, FloorBooth, SizeStyle } from "./types";
import { BackgroundAlignment, computeBackgroundRect } from "@/lib/floorplan/transform";
import { parseVenueBoundary, isFootprintWithinBoundary, boundaryExtentMm, type VenueBoundary } from "@/lib/floorplan/boundary";

/** "x1,y1 x2,y2 ..." for an SVG <polygon points> attribute. */
function polygonPointsStr(points: { x: number; y: number }[]): string {
  return points.map((p) => `${p.x},${p.y}`).join(" ");
}

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

// The floor plan canvas's coordinate space is either the LEGACY 0-100 x
// 0-100 percentage square (every pre-existing event, and any event whose
// venue physical scale hasn't been confirmed yet — see
// lib/floorplan/transform.ts getFloorplanViewBox) or, once an event's scale
// IS confirmed, the venue's own real-world size in millimetres used
// DIRECTLY as SVG user units (viewBox = venueWidthMm x venueDepthMm) — so
// gridX/Y/W/H simply ARE the mm coordinates in that mode, the venue's true
// aspect ratio is preserved automatically, and zoom (a separate CSS
// transform layered on top, see `scale`/`translate` state below) never
// touches these values. All snap/nudge/handle-size constants below are
// expressed as functions of the CURRENT viewBox so the same code produces
// correct legacy percent-space behavior (unchanged from before this
// component became viewBox-parametric) and correct real-world behavior in
// mm mode (e.g. an ~1 meter grid, not "1% of an arbitrary square").
const DEFAULT_VIEWBOX = { width: 100, height: 100 };

interface ViewBoxSize {
  width: number;
  height: number;
}

/** General visual-scale factor: 1 at the legacy 100x100 square, and
 *  proportionally larger in mm mode — every literal pixel-ish constant in
 *  this file (stroke widths, font sizes, handle sizes, corner radii) is
 *  multiplied by this so booths/handles/text look the same SIZE relative to
 *  the venue regardless of which coordinate space is active. */
function unitScaleOf(viewBox: ViewBoxSize): number {
  return Math.max(viewBox.width, viewBox.height) / 100;
}

interface SnapTuning {
  alignThreshold: number;
  spacingTolerance: number;
  gridSize: number;
  nudgeAmount: number;
  nudgeAmountBig: number;
  minBoothSize: number;
  rotateHandleOffset: number;
}

/** Legacy mode keeps the exact percent-based tuning this component always
 *  used (1% align threshold, 1% grid, etc.) — zero behavior change for any
 *  event that hasn't been scale-confirmed. MM mode uses real physical
 *  defaults: ~5cm align snap, a 1m grid, 50mm/500mm nudge steps, a 30cm
 *  minimum booth size — see requirement: physical grid/snapping (1m
 *  major/0.25-0.5m minor), not a raw canvas percentage. */
function snapTuningFor(viewBox: ViewBoxSize, mode: "MM" | "LEGACY_PERCENT"): SnapTuning {
  if (mode === "MM") {
    return {
      alignThreshold: 50,
      spacingTolerance: 60,
      gridSize: 1000,
      nudgeAmount: 50,
      nudgeAmountBig: 500,
      minBoothSize: 300,
      rotateHandleOffset: Math.min(viewBox.width, viewBox.height) * 0.06,
    };
  }
  return {
    alignThreshold: 1,
    spacingTolerance: 1.2,
    gridSize: 1,
    nudgeAmount: 0.5,
    nudgeAmountBig: 2,
    minBoothSize: 2,
    rotateHandleOffset: 6,
  };
}

interface GridLineSpec {
  pos: number;
  major: boolean;
}

/** The physical background grid's line positions along one axis, in real mm
 *  — 1m major lines always, plus 0.25m minor lines (0.5m once the venue is
 *  large enough that 0.25m would draw hundreds of near-invisible lines) —
 *  see requirement: physical grid driven by venue mm scale (1m major /
 *  0.25-0.5m minor), not a fixed percentage-of-canvas pattern. Only
 *  meaningful in MM mode; LEGACY_PERCENT venues have no real distance to
 *  grid against, so callers should skip this entirely in that mode. */
function gridLinesFor(lengthMm: number): GridLineSpec[] {
  const minorStep = lengthMm > 40000 ? 500 : 250;
  const lines: GridLineSpec[] = [];
  for (let pos = 0; pos <= lengthMm; pos += minorStep) {
    lines.push({ pos, major: pos % 1000 === 0 });
  }
  return lines;
}

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

/** Formats a gap for the smart-guide distance label. In MM mode the gap is
 *  already a real millimetre distance (no conversion needed — this is the
 *  whole point of rendering in mm-native SVG units). In legacy percent mode,
 *  falls back to the old venueWidthM-derived approximate label, or a raw
 *  percentage when even that isn't set. */
function formatDistance(gap: number, mode: "MM" | "LEGACY_PERCENT", venueWidthM?: number | null): string {
  if (mode === "MM") {
    const meters = gap / 1000;
    return `${meters.toFixed(meters < 10 ? 2 : 1)}m`;
  }
  if (venueWidthM && venueWidthM > 0) {
    const meters = (gap / 100) * venueWidthM;
    return `${meters.toFixed(meters < 10 ? 1 : 0)}m`;
  }
  return `${gap.toFixed(1)}%`;
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
function computeAlignmentSnap(dragged: Rect, others: FloorBooth[], alignThreshold: number) {
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
        if (delta <= alignThreshold && (!bestX || delta < bestX.delta)) bestX = { offset: c.offset, value: ov, delta, other: o };
      }
    }
    for (const c of yCands) {
      for (const ov of oys) {
        const delta = Math.abs(c.at - ov);
        if (delta <= alignThreshold && (!bestY || delta < bestY.delta)) bestY = { offset: c.offset, value: ov, delta, other: o };
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
function computeRowSpacingSnap(dragged: Rect, others: FloorBooth[], spacingTolerance: number) {
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
    if (refGap > 0.1 && Math.abs(curGap - refGap) <= spacingTolerance) {
      return { gridX: left.gridX + left.gridW + refGap };
    }
  }
  if (right && rightOfRight) {
    const refGap = rightOfRight.gridX - (right.gridX + right.gridW);
    const curGap = right.gridX - (dragged.gridX + dragged.gridW);
    if (refGap > 0.1 && Math.abs(curGap - refGap) <= spacingTolerance) {
      return { gridX: right.gridX - dragged.gridW - refGap };
    }
  }
  if (left && right) {
    const avail = right.gridX - (left.gridX + left.gridW);
    const gap = (avail - dragged.gridW) / 2;
    if (gap > 0.1) {
      const curGapLeft = dragged.gridX - (left.gridX + left.gridW);
      const curGapRight = right.gridX - (dragged.gridX + dragged.gridW);
      if (Math.abs(curGapLeft - gap) <= spacingTolerance || Math.abs(curGapRight - gap) <= spacingTolerance) {
        return { gridX: left.gridX + left.gridW + gap };
      }
    }
  }
  return {} as { gridX?: number };
}

/** Same as computeRowSpacingSnap but along the vertical (column) axis. */
function computeColumnSpacingSnap(dragged: Rect, others: FloorBooth[], spacingTolerance: number) {
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
    if (refGap > 0.1 && Math.abs(curGap - refGap) <= spacingTolerance) {
      return { gridY: top.gridY + top.gridH + refGap };
    }
  }
  if (bottom && bottomOfBottom) {
    const refGap = bottomOfBottom.gridY - (bottom.gridY + bottom.gridH);
    const curGap = bottom.gridY - (dragged.gridY + dragged.gridH);
    if (refGap > 0.1 && Math.abs(curGap - refGap) <= spacingTolerance) {
      return { gridY: bottom.gridY - dragged.gridH - refGap };
    }
  }
  if (top && bottom) {
    const avail = bottom.gridY - (top.gridY + top.gridH);
    const gap = (avail - dragged.gridH) / 2;
    if (gap > 0.1) {
      const curGapTop = dragged.gridY - (top.gridY + top.gridH);
      const curGapBottom = bottom.gridY - (dragged.gridY + dragged.gridH);
      if (Math.abs(curGapTop - gap) <= spacingTolerance || Math.abs(curGapBottom - gap) <= spacingTolerance) {
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
  venueWidthM: number | null | undefined,
  viewBox: ViewBoxSize,
  mode: "MM" | "LEGACY_PERCENT",
  tuning: SnapTuning
): { gridX: number; gridY: number; guides: Guides | null } {
  let gridX = raw.gridX;
  let gridY = raw.gridY;
  const vLines: GuideLine[] = [];
  const hLines: GuideLine[] = [];
  const labels: GuideLabel[] = [];
  let snappedX = false;
  let snappedY = false;

  if (smartGuidesEnabled) {
    const align = computeAlignmentSnap({ gridX, gridY, gridW: raw.gridW, gridH: raw.gridH }, others, tuning.alignThreshold);
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
      const rowSnap = computeRowSpacingSnap({ gridX, gridY, gridW: raw.gridW, gridH: raw.gridH }, others, tuning.spacingTolerance);
      if (rowSnap.gridX != null) {
        gridX = rowSnap.gridX;
        snappedX = true;
      }
    }
    if (!snappedY) {
      const colSnap = computeColumnSpacingSnap({ gridX, gridY, gridW: raw.gridW, gridH: raw.gridH }, others, tuning.spacingTolerance);
      if (colSnap.gridY != null) {
        gridY = colSnap.gridY;
        snappedY = true;
      }
    }
  }

  if (gridSnapEnabled) {
    if (!snappedX) gridX = Math.round(gridX / tuning.gridSize) * tuning.gridSize;
    if (!snappedY) gridY = Math.round(gridY / tuning.gridSize) * tuning.gridSize;
  }

  gridX = Math.min(viewBox.width - raw.gridW, Math.max(0, gridX));
  gridY = Math.min(viewBox.height - raw.gridH, Math.max(0, gridY));

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
      if (gap > 0.1) labels.push({ x: leftN.gridX + leftN.gridW + gap / 2, y: midY, text: formatDistance(gap, mode, venueWidthM) });
    }
    if (rightN) {
      const gap = rightN.gridX - (gridX + raw.gridW);
      if (gap > 0.1) labels.push({ x: gridX + raw.gridW + gap / 2, y: midY, text: formatDistance(gap, mode, venueWidthM) });
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
      if (gap > 0.1) labels.push({ x: midX, y: topN.gridY + topN.gridH + gap / 2, text: formatDistance(gap, mode, venueWidthM) });
    }
    if (botN) {
      const gap = botN.gridY - (gridY + raw.gridH);
      if (gap > 0.1) labels.push({ x: midX, y: gridY + raw.gridH + gap / 2, text: formatDistance(gap, mode, venueWidthM) });
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

interface ViewportRect {
  width: number;
  height: number;
}

/** The "Fit Venue" scale — and, per the bounded-viewer requirement, the hard
 *  floor for how far out the user may ever zoom (minZoom = fitZoom, never an
 *  arbitrary constant like the old flat 0.5). For a RECTANGLE boundary (or
 *  LEGACY_PERCENT mode, or no boundary at all) this is always exactly 1: the
 *  <svg> element is fixed at the container's own pixel size (width/height
 *  100%), so CSS scale 1 already frames the complete venue — going below 1
 *  would only ever reveal the container's own background past the SVG's
 *  edge, never more venue. For a smaller/differently-shaped CIRCLE/OVAL/
 *  POLYGON boundary, computes how far to zoom IN so the boundary's own
 *  padded extent (never the larger enclosing coordinate box) fills the
 *  viewport — the exact math "Fit Venue" already used, now also doubling as
 *  the pan/zoom floor everywhere else in this component (wheel, pinch,
 *  +/- buttons, resize). Floored at 1: a boundary whose own bounding box
 *  already spans the full coordinate box on an axis (e.g. an L-shaped
 *  polygon touching all four sides) would otherwise have its small
 *  breathing-room padding push the raw math fractionally BELOW 1 — but
 *  scale 1 already frames the ENTIRE coordinate box, a strict superset of
 *  any boundary, so there is never a legitimate reason to zoom out further
 *  than that; doing so would only reveal empty canvas past the venue's own
 *  frame, the exact bug this floor exists to prevent. */
function computeFitZoom(rect: ViewportRect, viewBox: ViewBoxSize, boundary: VenueBoundary, showBoundary: boolean): number {
  if (!showBoundary || boundary.shape === "RECTANGLE") return 1;
  if (rect.width <= 0 || rect.height <= 0) return 1;
  const extent = boundaryExtentMm(boundary, viewBox.width, viewBox.height);
  const PAD = Math.max(viewBox.width, viewBox.height) * 0.04;
  const boxW = Math.max(extent.maxX - extent.minX + PAD * 2, viewBox.width * 0.05);
  const boxH = Math.max(extent.maxY - extent.minY + PAD * 2, viewBox.height * 0.05);
  const containerAspect = rect.width / rect.height;
  const viewBoxAspect = viewBox.width / viewBox.height;
  const basePxPerUnit = viewBoxAspect > containerAspect ? rect.width / viewBox.width : rect.height / viewBox.height;
  const boxAspect = boxW / boxH;
  const pxPerUnitForBox = boxAspect > containerAspect ? rect.width / boxW : rect.height / boxH;
  return Math.max(1, pxPerUnitForBox / basePxPerUnit);
}

/** The translate that centers the Fit Venue view at `fitScale` (paired 1:1
 *  with computeFitZoom's own scale) — the boundary's own extent for a
 *  non-rectangle shape, or simply {0,0} for a RECTANGLE (the raw SVG box IS
 *  the venue in that case, already centered by construction) OR whenever
 *  fitScale is exactly the computeFitZoom floor of 1: at CSS scale 1 with
 *  zero translate, the <svg>'s own preserveAspectRatio="xMidYMid meet"
 *  ALREADY centers the complete coordinate box in the container with no JS
 *  translate needed — and since the box is always a strict superset of any
 *  boundary, that view is guaranteed to show the whole boundary too.
 *  Computing a boundary-extent-centered offset on top of that would double
 *  up on centering and could shift the box off-true (clipping one edge to
 *  show empty margin on the other) for a boundary that isn't itself
 *  centered in the box on the axis that didn't drive the scale. */
function computeFitTranslate(
  rect: ViewportRect,
  viewBox: ViewBoxSize,
  boundary: VenueBoundary,
  showBoundary: boolean,
  fitScale: number
): { x: number; y: number } {
  if (!showBoundary || boundary.shape === "RECTANGLE" || fitScale <= 1) return { x: 0, y: 0 };
  const extent = boundaryExtentMm(boundary, viewBox.width, viewBox.height);
  const cx = (extent.minX + extent.maxX) / 2;
  const cy = (extent.minY + extent.maxY) / 2;
  const containerAspect = rect.width / rect.height;
  const viewBoxAspect = viewBox.width / viewBox.height;
  const basePxPerUnit = viewBoxAspect > containerAspect ? rect.width / viewBox.width : rect.height / viewBox.height;
  const unit = basePxPerUnit * fitScale;
  return { x: rect.width / 2 - cx * unit, y: rect.height / 2 - cy * unit };
}

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
  backgroundAlignment,
  placementMode = false,
  onCanvasClick,
  editable = false,
  onBoothCommit,
  selectedFeatureId,
  onFeatureSelectionChange,
  onFeatureCommit,
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
  focusBoothIds,
  groupFocusNonce,
  fitViewNonce,
  viewBox = DEFAULT_VIEWBOX,
  coordinateMode = "LEGACY_PERCENT",
  venueShape,
  venueBoundaryJson,
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
  /** Event.venueBackground* alignment fields (Background Alignment wizard
   *  step) — when present AND coordinateMode is "MM", the image is placed
   *  at the EXACT rect lib/floorplan/transform.ts computeBackgroundRect()
   *  derives from these, instead of the naive full-viewBox contain-fit
   *  below. Omit (or leave naturalWidthPx/HeightPx null) to keep that
   *  auto-fit fallback — every caller that doesn't pass this renders
   *  exactly as before. */
  backgroundAlignment?: BackgroundAlignment | null;
  /** When true, clicking empty canvas calls onCanvasClick instead of panning. */
  placementMode?: boolean;
  onCanvasClick?: (xPercent: number, yPercent: number) => void;
  /** Admin floor-plan-builder mode: the selection gets drag-to-move, corner
   *  resize handles (solo only) and a rotate handle (solo only) — like
   *  moving/resizing objects on a slide. */
  editable?: boolean;
  onBoothCommit?: (id: string, patch: BoothPatch) => void;
  /** Structural feature (entrance/toilets/office/...) selection + editing —
   *  independent of booth selection. Passing selectedFeatureId (even null)
   *  enables click-to-select, drag-to-move and a rotate handle on features,
   *  the same interaction booths already have, gated on `editable`. A
   *  feature's own size is fixed at creation (see FloorPlanBuilder's Add
   *  Feature form) — only position and rotation are ever manipulated here. */
  selectedFeatureId?: string | null;
  onFeatureSelectionChange?: (id: string | null) => void;
  onFeatureCommit?: (id: string, patch: { gridX?: number; gridY?: number; rotation?: number }) => void;
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
  /** When set to 1+ booth ids present in `booths` ("Focus My Booth(s)" for
   *  a booking), pans/zooms to fit ALL of their bounding boxes in view
   *  together (a single id just fits that one booth with padding). Driven
   *  by its own `groupFocusNonce` below — independent of focusBoothId /
   *  focusNonce, so a page can offer both a "recenter on my primary
   *  booth" control and a separate "fit all my booths" control. */
  focusBoothIds?: string[] | null;
  /** Bump this (any changed number) to re-run the focusBoothIds fit —
   *  mirrors focusNonce's re-trigger role but scoped to the group-fit
   *  effect only, so it never fires the single-booth focusBoothId
   *  effect. */
  groupFocusNonce?: number;
  /** Bump this (any changed number) to pan/zoom back to the full venue —
   *  "Fit Venue" — i.e. reset scale/translate to the identity view, the
   *  same view the canvas opens at and its own internal reset button
   *  produces, just externally triggerable (e.g. a "Fit Venue" button
   *  outside this component, on View Booking). */
  fitViewNonce?: number;
  /** The coordinate space to render in — venueWidthMm x venueDepthMm (real
   *  millimetres, used directly as SVG user units) once the caller's Event
   *  has a confirmed physical scale, or the legacy 100x100 percentage
   *  square otherwise (the default, so every existing caller that doesn't
   *  pass this keeps rendering exactly as before). Compute with
   *  lib/floorplan/transform.ts getFloorplanViewBox(event). */
  viewBox?: ViewBoxSize;
  /** "MM" pairs with a real-millimetre viewBox; "LEGACY_PERCENT" (default)
   *  is the original 0-100 percentage canvas. Drives snap/grid/nudge sizing
   *  and distance-label formatting — see snapTuningFor/formatDistance. */
  coordinateMode?: "MM" | "LEGACY_PERCENT";
  /** Event.venueShape/venueBoundaryJson (see lib/floorplan/boundary.ts) —
   *  the venue's ACTUAL usable footprint, which may be smaller than the
   *  viewBox's rectangular coordinate box (a circular/oval/polygon venue
   *  never fills it). When present and coordinateMode is "MM", the shared
   *  canvas renders this as a perimeter outline plus a shaded mask over the
   *  area outside it — the same boundary geometry lib/floorplan/boundary.ts
   *  enforces server-side, never a separate percentage-based overlay.
   *  Omit to render with no boundary overlay at all (every caller that
   *  doesn't pass this keeps rendering exactly as before). */
  venueShape?: string | null;
  venueBoundaryJson?: string | null;
}) {
  const tuning = snapTuningFor(viewBox, coordinateMode);
  const unitScale = unitScaleOf(viewBox);
  // Only meaningful once real mm venue geometry exists — in legacy percent
  // mode there's no physical size for computeBackgroundRect to place the
  // image against, so it always falls back to the naive full-viewBox
  // contain-fit below regardless of what backgroundAlignment holds.
  const alignedBackgroundRect =
    coordinateMode === "MM" && backgroundAlignment
      ? computeBackgroundRect({ venueWidthMm: viewBox.width, venueDepthMm: viewBox.height }, backgroundAlignment)
      : null;
  // Physical background grid (1m major / 0.25-0.5m minor) — MM mode only;
  // legacy percent-mode venues have no real distance for a physical grid to
  // mean anything, so they keep the plain diagonal-hatch canvas background.
  const verticalGridLines = useMemo(() => (coordinateMode === "MM" ? gridLinesFor(viewBox.width) : []), [coordinateMode, viewBox.width]);
  const horizontalGridLines = useMemo(() => (coordinateMode === "MM" ? gridLinesFor(viewBox.height) : []), [coordinateMode, viewBox.height]);

  // Venue boundary (see lib/floorplan/boundary.ts) — the venue's ACTUAL
  // usable footprint, only meaningful once real mm venue geometry exists.
  // parseVenueBoundary never throws and falls back to RECTANGLE for
  // missing/malformed data, so this is always safe to compute even for a
  // caller that doesn't pass venueShape/venueBoundaryJson at all (every such
  // caller renders a plain rectangle boundary matching the full viewBox,
  // which is a no-op visually — see the RECTANGLE branches below). Admin
  // (editable) gets a more prominent perimeter + booth-violation flags;
  // every read-only vendor-facing surface gets the same geometry rendered
  // subtler, per requirement: same boundary, different visual weight.
  const boundary: VenueBoundary = useMemo(
    () => parseVenueBoundary(venueShape ?? null, venueBoundaryJson ?? null),
    [venueShape, venueBoundaryJson]
  );
  const showBoundary = coordinateMode === "MM";
  const isAdminBoundaryView = editable;
  const boundaryStrokeColor = "#4A6B8A";
  const boundaryStrokeWidth = (isAdminBoundaryView ? 0.45 : 0.22) * unitScale;
  const boundaryStrokeOpacity = isAdminBoundaryView ? 0.85 : 0.5;
  const outsideMaskId = useId();
  // Every booth outside the actual boundary, admin view only — computed
  // with the SAME isFootprintWithinBoundary the server uses to enforce
  // this, never a separate/approximate client-side rule. Booths missing
  // real mm geometry (never migrated/placed under a confirmed scale) are
  // skipped, same as every other boundary-aware path in this system.
  const boothsOutsideBoundary = useMemo(() => {
    if (!showBoundary || !isAdminBoundaryView) return new Set<string>();
    const venueBox = { widthMm: viewBox.width, depthMm: viewBox.height, boundary };
    const set = new Set<string>();
    for (const b of booths) {
      if (b.xMm == null || b.yMm == null || b.widthMm == null || b.depthMm == null) continue;
      if (!isFootprintWithinBoundary(venueBox, { xMm: b.xMm, yMm: b.yMm, widthMm: b.widthMm, depthMm: b.depthMm, rotationDeg: b.rotation ?? 0 })) {
        set.add(b.id);
      }
    }
    return set;
  }, [showBoundary, isAdminBoundaryView, booths, boundary, viewBox.width, viewBox.height]);

  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  // The "Fit Venue" scale (see computeFitZoom above) — ALSO the hard floor
  // clampScale enforces, so the venue can never be zoomed out past what Fit
  // Venue itself shows. Starts at 1 (correct for the overwhelming majority
  // of events — a RECTANGLE boundary, where fitZoom is always exactly 1) and
  // is corrected for a non-rectangle boundary once the container is first
  // measurable (see the mount effect below), then kept in sync with the
  // container's actual size via a ResizeObserver.
  const [fitZoom, setFitZoom] = useState(1);
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
  // Feature move/rotate — deliberately separate from the booth Manip state
  // machine above: a feature is always a single, solo drag (no group-move,
  // no resize, no rubber-band selection), so per-element pointer capture on
  // its own <g> is simpler and sufficient rather than routing through the
  // container-level dispatch booths need for multi-select coordination.
  const featureManipRef = useRef<
    | { kind: "move"; id: string; startPointer: { x: number; y: number }; startGrid: { x: number; y: number }; moved: boolean }
    | { kind: "rotate"; id: string; center: { x: number; y: number }; moved: boolean }
    | null
  >(null);
  const [featurePreview, setFeaturePreview] = useState<{ id: string; gridX?: number; gridY?: number; rotation?: number } | null>(null);

  const multiSelectMode = selectedIds !== undefined;

  // minZoom is ALWAYS fitZoom — never an arbitrary constant (the old
  // flat 0.5 floor is exactly what let the venue shrink to a speck inside a
  // huge navigable empty canvas). Applies identically regardless of how zoom
  // happens: wheel, pinch, the +/- buttons, or a resize-driven re-clamp.
  const clampScale = useCallback((s: number) => Math.min(4, Math.max(fitZoom, s)), [fitZoom]);

  // Bounded pan: the venue can never be dragged so far that empty space
  // shows past its edge — when zoomed in, translate is clamped so the
  // scaled content always still fully covers the container; when zoomed
  // out below 100% coverage on an axis (content smaller than the
  // container), that axis is instead centered exactly, which is what
  // makes scale=1/translate=0 ("Fit Venue", the ⤾ button) always land on
  // a clean, fully-visible view regardless of prior pan state.
  const clampTranslate = useCallback((t: { x: number; y: number }, s: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return t;
    const contentW = rect.width * s;
    const contentH = rect.height * s;
    const x = contentW >= rect.width ? Math.min(0, Math.max(rect.width - contentW, t.x)) : (rect.width - contentW) / 2;
    const y = contentH >= rect.height ? Math.min(0, Math.max(rect.height - contentH, t.y)) : (rect.height - contentH) / 2;
    return { x, y };
  }, []);

  // Imperative mirrors of scale/translate for the ResizeObserver callback
  // below, which must read the LATEST values without itself depending on
  // them (that would mean reconnecting the observer on every pan/zoom).
  const scaleRef = useRef(scale);
  const translateRef = useRef(translate);
  useEffect(() => {
    scaleRef.current = scale;
  }, [scale]);
  useEffect(() => {
    translateRef.current = translate;
  }, [translate]);

  // Despite the name (kept for minimal diff against the rest of this file),
  // this resolves a screen point into the CURRENT viewBox's own coordinate
  // space — percent units in legacy mode, real millimetres in MM mode —
  // via the SVG's own screen-to-user-space matrix, so it's correct
  // regardless of which viewBox is active.
  const pointToPercent = useCallback(
    (clientX: number, clientY: number) => {
      const svg = svgRef.current;
      if (!svg) return null;
      const pt = svg.createSVGPoint();
      pt.x = clientX;
      pt.y = clientY;
      const ctm = svg.getScreenCTM();
      if (!ctm) return null;
      const loc = pt.matrixTransform(ctm.inverse());
      return { x: Math.min(viewBox.width, Math.max(0, loc.x)), y: Math.min(viewBox.height, Math.max(0, loc.y)) };
    },
    [viewBox.width, viewBox.height]
  );

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
      setTranslate(clampTranslate({ x: dragState.current.startTranslate.x + dx, y: dragState.current.startTranslate.y + dy }, scale));
    },
    [pointToPercent, clampTranslate, scale]
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
        if (x2 - x1 < viewBox.width * 0.005 && y2 - y1 < viewBox.height * 0.005) {
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
      } else if (wasClick && !placementMode) {
        // Clicked empty canvas (not a booth/feature, which stop propagation
        // before this fires) — deselect, same as clicking empty space in
        // Figma/Slides. Booth and feature selection are independent, so
        // both get cleared here.
        onDeselect?.();
        onFeatureSelectionChange?.(null);
      }
    },
    [placementMode, onCanvasClick, pointToPercent, onDeselect, onFeatureSelectionChange, booths, selectedIds, onSelectionChange, viewBox.width, viewBox.height]
  );

  const onWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      setScale((s) => clampScale(s - e.deltaY * 0.0015));
    },
    [clampScale]
  );

  // Re-clamps translate whenever scale changes (wheel, pinch, +/− buttons,
  // or the ⤾ reset) — a translate that was valid at the old scale can put
  // the venue partly off-screen at the new one, e.g. panned near an edge
  // then zoomed out below the point where that pan is still in-bounds.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- re-derives translate from the new scale + container size, not a plain render-time computation
    setTranslate((t) => clampTranslate(t, scale));
  }, [scale, clampTranslate]);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const [a, b] = [e.touches[0], e.touches[1]];
      const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      pinchState.current = { dist, scale };
    }
  }, [scale]);

  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length === 2 && pinchState.current) {
        const [a, b] = [e.touches[0], e.touches[1]];
        const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
        const ratio = dist / pinchState.current.dist;
        setScale(clampScale(pinchState.current.scale * ratio));
      }
    },
    [clampScale]
  );

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
    // SVG user-units-per-pixel under preserveAspectRatio="xMidYMid meet":
    // whichever axis of the viewBox is relatively larger than the
    // container's is the one that determines the fit scale (the other axis
    // is letterboxed) — this is correct for both the legacy square viewBox
    // and a real non-square venue's mm viewBox.
    const containerAspect = rect.width / rect.height;
    const viewBoxAspect = viewBox.width / viewBox.height;
    const pxPerUnit = viewBoxAspect > containerAspect ? rect.width / viewBox.width : rect.height / viewBox.height;
    const cx = booth.gridX + booth.gridW / 2;
    const cy = booth.gridY + booth.gridH / 2;
    const targetScale = clampScale(Math.max(scale, 1.6));
    const unit = pxPerUnit * targetScale;
    setScale(targetScale);
    setTranslate(clampTranslate({ x: rect.width / 2 - cx * unit, y: rect.height / 2 - cy * unit }, targetScale));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberately re-checks on booths/scale changes but only acts once per (focusBoothId, focusNonce) pair (see lastFocusedBoothRef guard above)
  }, [focusBoothId, focusNonce, booths, viewBox.width, viewBox.height]);

  const lastFocusedGroupRef = useRef<string | null>(null);

  // Forget the last-focused group key once focusBoothIds is cleared/emptied,
  // mirroring the focusBoothId reset above.
  useEffect(() => {
    if (!focusBoothIds || focusBoothIds.length === 0) lastFocusedGroupRef.current = null;
  }, [focusBoothIds]);

  // "Focus My Booth(s)" — fits ALL of focusBoothIds' bounding boxes
  // together (a single id just fits that one booth with padding). Driven
  // by its own groupFocusNonce, independent of focusBoothId/focusNonce,
  // so this is a self-contained control regardless of booth count. Same
  // once-per-(ids,nonce) guard and hidden-container retry behavior as the
  // single-booth focus effect above.
  useEffect(() => {
    const ids = (focusBoothIds ?? []).filter((id) => booths.some((b) => b.id === id));
    const key = `${[...ids].sort().join(",")}:${groupFocusNonce ?? 0}`;
    if (ids.length < 1 || key === lastFocusedGroupRef.current) return;
    const members = booths.filter((b) => ids.includes(b.id));
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    lastFocusedGroupRef.current = key;

    const minX = Math.min(...members.map((b) => b.gridX));
    const minY = Math.min(...members.map((b) => b.gridY));
    const maxX = Math.max(...members.map((b) => b.gridX + b.gridW));
    const maxY = Math.max(...members.map((b) => b.gridY + b.gridH));
    const PAD = Math.max(viewBox.width, viewBox.height) * 0.08; // breathing room around the group
    const boxW = Math.max(maxX - minX + PAD * 2, viewBox.width * 0.05);
    const boxH = Math.max(maxY - minY + PAD * 2, viewBox.height * 0.05);
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;

    const containerAspect = rect.width / rect.height;
    const viewBoxAspect = viewBox.width / viewBox.height;
    const basePxPerUnit = viewBoxAspect > containerAspect ? rect.width / viewBox.width : rect.height / viewBox.height;
    const boxAspect = boxW / boxH;
    const pxPerUnitForBox = boxAspect > containerAspect ? rect.width / boxW : rect.height / boxH;
    const targetScale = clampScale(pxPerUnitForBox / basePxPerUnit);
    const unit = basePxPerUnit * targetScale;
    setScale(targetScale);
    setTranslate(clampTranslate({ x: rect.width / 2 - cx * unit, y: rect.height / 2 - cy * unit }, targetScale));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- clampScale/clampTranslate omitted deliberately (same once-per-key guard as the effect above; both are stable functions of state already covered by their own re-clamp effects)
  }, [focusBoothIds, groupFocusNonce, booths, viewBox.width, viewBox.height]);

  // "Fit Venue" — for a RECTANGLE boundary (or LEGACY_PERCENT mode, or no
  // boundary passed at all) this is IDENTICAL to the old behavior
  // (scale=1, translate=0 IS the full-venue view, since the SVG viewBox
  // already spans the whole venue under preserveAspectRatio="xMidYMid
  // meet") — zero behavior change for the overwhelming majority of events,
  // which use the default rectangle boundary. For a smaller/differently
  // shaped CIRCLE/OVAL/POLYGON boundary, frames the boundary's OWN extent
  // (lib/floorplan/boundary.ts boundaryExtentMm) instead of the enclosing
  // coordinate box — never fits an invisible box bigger than the real
  // venue. Also the ONLY place fitZoom (the minZoom floor — see
  // computeFitZoom above) gets (re)established, so calling this always
  // keeps clampScale's floor in sync with whatever it just fit to.
  const fitToBoundary = useCallback(() => {
    const el = containerRef.current;
    const rect = el?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) {
      setFitZoom(1);
      setScale(1);
      setTranslate({ x: 0, y: 0 });
      return;
    }
    const vb = { width: viewBox.width, height: viewBox.height };
    const fz = computeFitZoom(rect, vb, boundary, showBoundary);
    setFitZoom(fz);
    setScale(fz);
    setTranslate(computeFitTranslate(rect, vb, boundary, showBoundary, fz));
  }, [showBoundary, boundary, viewBox.width, viewBox.height]);

  // "Fit Venue" — externally-triggerable equivalent of the canvas's own
  // internal reset button.
  useEffect(() => {
    if (fitViewNonce == null) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reacting to an external "Fit Venue" trigger prop, not deriving from own render
    fitToBoundary();
  }, [fitViewNonce, fitToBoundary]);

  // Once, on first mount (or once the container becomes known — e.g. this
  // canvas was hidden behind a mobile List/Map toggle at mount time),
  // opens on Fit Venue — required for every boundary shape, not just non-
  // rectangle: for RECTANGLE it's a no-op (the useState(1)/{0,0} defaults
  // already ARE that view), but running it unconditionally also establishes
  // the real fitZoom floor up front (see computeFitZoom) instead of leaving
  // the default `1` in place until some other trigger recomputes it, and
  // for a non-rectangle boundary actually frames its real (often smaller/
  // off-center) extent instead of the enclosing coordinate box — so a
  // circular venue doesn't open small-and-centered inside a mostly-empty
  // square. Never re-fires after its first successful measurement, so it
  // never fights a subsequent manual pan/zoom.
  const initialFitDoneRef = useRef(false);
  useEffect(() => {
    if (initialFitDoneRef.current) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return;
    initialFitDoneRef.current = true;
    fitToBoundary();
  }, [fitToBoundary]);

  // After the container resizes (window resize, orientation change, sidebar
  // toggle, etc.) — recompute fitZoom for the new size and re-apply the
  // bounded-viewer invariant: never let the CURRENT scale end up below the
  // new floor, and always re-clamp translate into the new legal bounds (a
  // translate that was valid at the old container size can be illegal at
  // the new one even at an unchanged scale, since translate is stored in
  // screen pixels). If the view was already at (or now falls below) Fit
  // Venue, snaps cleanly to the new Fit Venue view rather than leaving a
  // stale, no-longer-centered translate in place; otherwise (the user had
  // zoomed in further than fit) keeps their zoom level and only re-clamps
  // pan — see requirement: preserve the current viewed location where
  // possible, but clamp again against the new legal bounds regardless.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const recomputeBounds = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const vb = { width: viewBox.width, height: viewBox.height };
      const fz = computeFitZoom(rect, vb, boundary, showBoundary);
      setFitZoom(fz);
      const wasAtOrBelowFit = scaleRef.current <= fz + 0.001;
      if (wasAtOrBelowFit) {
        setScale(fz);
        setTranslate(computeFitTranslate(rect, vb, boundary, showBoundary, fz));
        return;
      }
      setTranslate(clampTranslate(translateRef.current, scaleRef.current));
    };
    const ro = new ResizeObserver(recomputeBounds);
    ro.observe(el);
    return () => ro.disconnect();
  }, [viewBox.width, viewBox.height, boundary, showBoundary, clampTranslate]);

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
      let groupX = Math.min(viewBox.width - m.groupRect.gridW, Math.max(0, m.groupRect.gridX + dx));
      let groupY = Math.min(viewBox.height - m.groupRect.gridH, Math.max(0, m.groupRect.gridY + dy));

      const memberIds = new Set(m.members.map((mm) => mm.id));
      const others = booths.filter((o) => !memberIds.has(o.id));

      const snapped = computeSnappedPosition(
        { gridX: groupX, gridY: groupY, gridW: m.groupRect.gridW, gridH: m.groupRect.gridH },
        others,
        smartGuidesEnabled,
        gridSnapEnabled,
        venueWidthM,
        viewBox,
        coordinateMode,
        tuning
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
    [booths, smartGuidesEnabled, gridSnapEnabled, venueWidthM, viewBox, coordinateMode, tuning]
  );

  const computeResizePatch = (m: Extract<Manip, { kind: "resize" }>, pct: { x: number; y: number }): BoothPatch => {
    const vx = pct.x - m.anchorWorld.x;
    const vy = pct.y - m.anchorWorld.y;
    const local = rotateVec(vx, vy, -m.rotation);
    const newW = Math.max(tuning.minBoothSize, Math.min(viewBox.width, Math.abs(local.x)));
    const newH = Math.max(tuning.minBoothSize, Math.min(viewBox.height, Math.abs(local.y)));
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
        const amount = e.shiftKey ? tuning.nudgeAmountBig : tuning.nudgeAmount;
        const dx = e.key === "ArrowLeft" ? -amount : e.key === "ArrowRight" ? amount : 0;
        const dy = e.key === "ArrowUp" ? -amount : e.key === "ArrowDown" ? amount : 0;
        const members = booths.filter((b) => selectedIds.has(b.id));
        if (members.length === 0) return;
        const box = boundingBoxOf(members.map((b) => ({ startGridX: b.gridX, startGridY: b.gridY, gridW: b.gridW, gridH: b.gridH })));
        const clampedX = Math.min(viewBox.width - box.gridW, Math.max(0, box.gridX + dx));
        const clampedY = Math.min(viewBox.height - box.gridH, Math.max(0, box.gridY + dy));
        const finalDX = clampedX - box.gridX;
        const finalDY = clampedY - box.gridY;
        onGroupCommit?.(members.map((b) => ({ id: b.id, gridX: b.gridX + finalDX, gridY: b.gridY + finalDY })));
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [multiSelectMode, editable, booths, selectedIds, onSelectionChange, onGroupCommit, onDeleteSelected, onDuplicateSelected, tuning, viewBox]);

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
            disabled={scale <= fitZoom + 0.001}
            aria-label="Zoom out"
            title="Zoom out"
            className="w-7 h-7 rounded-full border border-brown/30 hover:bg-brown/10 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
          >
            −
          </button>
          <button
            type="button"
            onClick={fitToBoundary}
            title="Fit Venue"
            aria-label="Fit Venue"
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
          viewBox={`0 0 ${viewBox.width} ${viewBox.height}`}
          preserveAspectRatio="xMidYMid meet"
          style={{
            transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale})`,
            transformOrigin: "0 0",
          }}
        >
          <rect x={0} y={0} width={viewBox.width} height={viewBox.height} fill="transparent" stroke="#DDD3C3" strokeWidth={0.3 * unitScale} />

          {coordinateMode === "MM" && (
            <g pointerEvents="none">
              {verticalGridLines.map((l) => (
                <line
                  key={`gv${l.pos}`}
                  x1={l.pos}
                  y1={0}
                  x2={l.pos}
                  y2={viewBox.height}
                  stroke="#DDD3C3"
                  strokeWidth={(l.major ? 0.22 : 0.08) * unitScale}
                  opacity={l.major ? 0.55 : 0.28}
                />
              ))}
              {horizontalGridLines.map((l) => (
                <line
                  key={`gh${l.pos}`}
                  x1={0}
                  y1={l.pos}
                  x2={viewBox.width}
                  y2={l.pos}
                  stroke="#DDD3C3"
                  strokeWidth={(l.major ? 0.22 : 0.08) * unitScale}
                  opacity={l.major ? 0.55 : 0.28}
                />
              ))}
            </g>
          )}

          {backgroundImageUrl && alignedBackgroundRect && (
            // Precise admin-controlled placement from the Background
            // Alignment wizard step: computeBackgroundRect already applies
            // a single UNIFORM scale (never separate x/y), so this rect is
            // never stretched — rotate around its own center via `rotate`,
            // the same convention booths/features use.
            <image
              href={backgroundImageUrl}
              x={alignedBackgroundRect.x}
              y={alignedBackgroundRect.y}
              width={alignedBackgroundRect.width}
              height={alignedBackgroundRect.height}
              transform={
                alignedBackgroundRect.rotationDeg
                  ? `rotate(${alignedBackgroundRect.rotationDeg} ${alignedBackgroundRect.x + alignedBackgroundRect.width / 2} ${alignedBackgroundRect.y + alignedBackgroundRect.height / 2})`
                  : undefined
              }
              preserveAspectRatio="none"
            />
          )}

          {backgroundImageUrl && !alignedBackgroundRect && (
            // Fallback before an admin has aligned the image (or in legacy
            // percent mode, where there's no mm venue box to align against):
            // preserveAspectRatio="xMidYMid meet" (SVG's own contain-fit,
            // the direct equivalent of CSS object-fit:contain) — NEVER
            // "none" here. The image spans the full viewBox but the browser
            // itself letterboxes it to the image's true aspect ratio instead
            // of stretching, so a non-square venue photo/drawing renders
            // undistorted regardless of the venue's own proportions.
            <image href={backgroundImageUrl} x={0} y={0} width={viewBox.width} height={viewBox.height} preserveAspectRatio="xMidYMid meet" />
          )}

          {/* Outside-venue-boundary shading — sits over the architectural
              background/grid but below every booth/feature, so the "this is
              where booths are allowed" framing never obscures anything
              interactive. A RECTANGLE boundary (the default — most events)
              has no outside area to shade, so this renders nothing for it;
              the mask hole exactly matches the SAME shape the perimeter
              outline below draws and the server enforces via
              isFootprintWithinBoundary, never a separate approximation. */}
          {showBoundary && boundary.shape !== "RECTANGLE" && (
            <>
              <defs>
                <mask id={outsideMaskId} maskUnits="userSpaceOnUse" x={0} y={0} width={viewBox.width} height={viewBox.height}>
                  <rect x={0} y={0} width={viewBox.width} height={viewBox.height} fill="white" />
                  {boundary.shape === "CIRCLE" && <circle cx={boundary.cx} cy={boundary.cy} r={boundary.r} fill="black" />}
                  {boundary.shape === "OVAL" && <ellipse cx={boundary.cx} cy={boundary.cy} rx={boundary.rx} ry={boundary.ry} fill="black" />}
                  {boundary.shape === "POLYGON" && boundary.points.length >= 3 && (
                    <polygon points={polygonPointsStr(boundary.points)} fill="black" />
                  )}
                </mask>
              </defs>
              <rect
                x={0}
                y={0}
                width={viewBox.width}
                height={viewBox.height}
                fill="#2A1D14"
                opacity={isAdminBoundaryView ? 0.1 : 0.2}
                mask={`url(#${outsideMaskId})`}
                style={{ pointerEvents: "none" }}
              />
            </>
          )}

          {features.map((f) => {
            const featureEditable = editable && selectedFeatureId !== undefined;
            const isFeaturePreview = featurePreview?.id === f.id;
            const gridX = isFeaturePreview && featurePreview.gridX !== undefined ? featurePreview.gridX : f.gridX;
            const gridY = isFeaturePreview && featurePreview.gridY !== undefined ? featurePreview.gridY : f.gridY;
            const rotation = isFeaturePreview && featurePreview.rotation !== undefined ? featurePreview.rotation : f.rotation || 0;
            const fcx = gridX + f.gridW / 2;
            const fcy = gridY + f.gridH / 2;
            const isSelectedFeature = featureEditable && selectedFeatureId === f.id;
            // "Landmarks as hero": on the vendor-facing read-only map (never
            // in the admin editor, where every feature must stay equally
            // legible/clickable for editing), an entrance gets a visually
            // dominant treatment — a vendor orienting themselves on the
            // venue map cares far more about "where do I walk in" than
            // about the loading dock or a stairwell, so it should read at a
            // glance, not require hunting for a small labeled box.
            const isHeroFeature = !editable && f.type.startsWith("ENTRANCE");
            return (
              <g key={f.id} transform={rotation ? `rotate(${rotation} ${fcx} ${fcy})` : undefined}>
                <rect
                  x={gridX}
                  y={gridY}
                  width={f.gridW}
                  height={f.gridH}
                  fill={isHeroFeature ? "#C9A050" : backgroundImageUrl ? "rgba(227,217,204,0.75)" : "#E3D9CC"}
                  fillOpacity={isHeroFeature ? 0.9 : 1}
                  stroke={isSelectedFeature ? "#2E7D32" : isHeroFeature ? "#8A5A38" : "#B79A7C"}
                  strokeWidth={(isSelectedFeature ? 0.35 : isHeroFeature ? 0.3 : 0.15) * unitScale}
                  strokeDasharray={f.type.startsWith("ENTRANCE") ? `${unitScale} ${0.7 * unitScale}` : undefined}
                  style={featureEditable ? { cursor: "move", touchAction: "none" } : undefined}
                  onPointerDown={
                    featureEditable
                      ? (e) => {
                          e.stopPropagation();
                          (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
                          onFeatureSelectionChange?.(f.id);
                          const pt = pointToPercent(e.clientX, e.clientY);
                          if (!pt) return;
                          featureManipRef.current = { kind: "move", id: f.id, startPointer: pt, startGrid: { x: f.gridX, y: f.gridY }, moved: false };
                        }
                      : undefined
                  }
                  onPointerMove={
                    featureEditable
                      ? (e) => {
                          const m = featureManipRef.current;
                          if (!m || m.id !== f.id || m.kind !== "move") return;
                          const pt = pointToPercent(e.clientX, e.clientY);
                          if (!pt) return;
                          const dx = pt.x - m.startPointer.x;
                          const dy = pt.y - m.startPointer.y;
                          if (Math.abs(dx) > 0.001 || Math.abs(dy) > 0.001) m.moved = true;
                          const newX = Math.min(viewBox.width - f.gridW, Math.max(0, m.startGrid.x + dx));
                          const newY = Math.min(viewBox.height - f.gridH, Math.max(0, m.startGrid.y + dy));
                          setFeaturePreview({ id: f.id, gridX: newX, gridY: newY });
                        }
                      : undefined
                  }
                  onPointerUp={
                    featureEditable
                      ? (e) => {
                          const m = featureManipRef.current;
                          featureManipRef.current = null;
                          (e.currentTarget as Element).releasePointerCapture?.(e.pointerId);
                          if (!m || m.id !== f.id || m.kind !== "move") return;
                          if (m.moved && featurePreview?.id === f.id && featurePreview.gridX !== undefined && featurePreview.gridY !== undefined) {
                            onFeatureCommit?.(f.id, { gridX: featurePreview.gridX, gridY: featurePreview.gridY });
                          }
                          setFeaturePreview(null);
                        }
                      : undefined
                  }
                />
                <text
                  x={fcx}
                  y={fcy}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={(isHeroFeature ? 3.2 : 2.2) * unitScale}
                  fontWeight={isHeroFeature ? 700 : 400}
                  fill={isHeroFeature ? "#4A2E18" : "#6B4429"}
                  style={{ pointerEvents: "none" }}
                >
                  {f.label || featureLabel[f.type]}
                </text>
                {isSelectedFeature && (
                  <circle
                    cx={fcx}
                    cy={fcy - Math.max(f.gridH / 2, tuning.minBoothSize / 2) - tuning.rotateHandleOffset}
                    r={0.9 * unitScale}
                    fill="#2E7D32"
                    style={{ cursor: "grab", touchAction: "none" }}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
                      featureManipRef.current = { kind: "rotate", id: f.id, center: { x: fcx, y: fcy }, moved: false };
                    }}
                    onPointerMove={(e) => {
                      const m = featureManipRef.current;
                      if (!m || m.id !== f.id || m.kind !== "rotate") return;
                      const pt = pointToPercent(e.clientX, e.clientY);
                      if (!pt) return;
                      const angleRad = Math.atan2(pt.y - m.center.y, pt.x - m.center.x);
                      let deg = (angleRad * 180) / Math.PI + 90;
                      deg = ((deg % 360) + 360) % 360;
                      const snapped = Math.round(deg / 15) * 15;
                      const diff = Math.abs(deg - snapped);
                      if (Math.min(diff, 360 - diff) < 3) deg = snapped;
                      deg = Math.round(((deg % 360) + 360) % 360);
                      m.moved = true;
                      setFeaturePreview({ id: f.id, rotation: deg });
                    }}
                    onPointerUp={(e) => {
                      const m = featureManipRef.current;
                      featureManipRef.current = null;
                      (e.currentTarget as Element).releasePointerCapture?.(e.pointerId);
                      if (!m || m.id !== f.id || m.kind !== "rotate") return;
                      if (m.moved && featurePreview?.id === f.id && featurePreview.rotation !== undefined) {
                        onFeatureCommit?.(f.id, { rotation: featurePreview.rotation });
                      }
                      setFeaturePreview(null);
                    }}
                  />
                )}
              </g>
            );
          })}

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
            // Admin-only, live-computed via the SAME isFootprintWithinBoundary
            // the server enforces (see boothsOutsideBoundary above) — never
            // hidden from an admin override that let it through; the whole
            // point is to keep an out-of-boundary placement visible, not to
            // suppress it once accepted.
            const isOutsideBoundary = boothsOutsideBoundary.has(b.id);

            return (
              <g key={b.id} transform={rotation ? `rotate(${rotation} ${cx} ${cy})` : undefined}>
                {isOutsideBoundary && <title>{`${b.code} — outside venue boundary`}</title>}
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
                    rx={0.5 * unitScale}
                    ry={0.5 * unitScale}
                    fill={isGroupSelected ? shadeColor(fill, -20) : clickable && isHovered ? shadeColor(fill, -30) : fill}
                    opacity={b.status === "SOLD" ? 0.6 : backgroundImageUrl ? 0.85 : 1}
                    stroke={isOutsideBoundary ? "#B91C1C" : isGroupSelected ? "#2563EB" : isSelected || b.isMine ? "#2E7D32" : clickable && isHovered ? "#FBF8F3" : "#3A2417"}
                    strokeWidth={(isOutsideBoundary ? 0.55 : isSelected || b.isMine ? 0.6 : clickable && isHovered ? 0.45 : 0.15) * unitScale}
                    strokeDasharray={isOutsideBoundary ? `${0.9 * unitScale} ${0.5 * unitScale}` : undefined}
                    style={{ transition: isBeingManipulated ? "none" : "fill 0.15s ease, stroke 0.15s ease, stroke-width 0.15s ease" }}
                  />
                  <text
                    x={cx}
                    y={cy}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize={2.4 * unitScale}
                    fontWeight={600}
                    fill="#FBF8F3"
                    style={{ pointerEvents: "none" }}
                  >
                    {b.code}
                  </text>
                </g>

                {isOutsideBoundary && (
                  // A small persistent "!" badge, not a full label — a
                  // dashed red outline already reads as "something's wrong"
                  // at a glance; the badge + <title> above supply the exact
                  // reason on hover without competing for space on a small
                  // booth. Admin-only (boothsOutsideBoundary is always empty
                  // for a non-editable canvas — see its computation above).
                  <g style={{ pointerEvents: "none" }}>
                    <circle cx={b.gridX + b.gridW - 0.3 * unitScale} cy={b.gridY + 0.3 * unitScale} r={1.1 * unitScale} fill="#B91C1C" stroke="#FBF8F3" strokeWidth={0.2 * unitScale} />
                    <text x={b.gridX + b.gridW - 0.3 * unitScale} y={b.gridY + 0.3 * unitScale} textAnchor="middle" dominantBaseline="central" fontSize={1.6 * unitScale} fontWeight={700} fill="#FBF8F3">
                      !
                    </text>
                  </g>
                )}

                {editable && isSoleSelected && (
                  <>
                    {(["nw", "ne", "sw", "se"] as const).map((h) => {
                      const hx = h.includes("w") ? b.gridX : b.gridX + b.gridW;
                      const hy = h.includes("n") ? b.gridY : b.gridY + b.gridH;
                      const hs = 2.2 * unitScale;
                      return (
                        <rect
                          key={h}
                          x={hx - hs / 2}
                          y={hy - hs / 2}
                          width={hs}
                          height={hs}
                          rx={0.3 * unitScale}
                          fill="#FBF8F3"
                          stroke="#2E7D32"
                          strokeWidth={0.4 * unitScale}
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
                      y2={b.gridY - tuning.rotateHandleOffset}
                      stroke="#2E7D32"
                      strokeWidth={0.3 * unitScale}
                    />
                    <circle
                      cx={cx}
                      cy={b.gridY - tuning.rotateHandleOffset}
                      r={1.4 * unitScale}
                      fill="#FBF8F3"
                      stroke="#2E7D32"
                      strokeWidth={0.4 * unitScale}
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
                <line key={`v${i}`} x1={l.pos} y1={l.from} x2={l.pos} y2={l.to} stroke="#EC4899" strokeWidth={0.25 * unitScale} strokeDasharray={`${unitScale} ${0.6 * unitScale}`} />
              ))}
              {guides.hLines.map((l, i) => (
                <line key={`h${i}`} x1={l.from} y1={l.pos} x2={l.to} y2={l.pos} stroke="#EC4899" strokeWidth={0.25 * unitScale} strokeDasharray={`${unitScale} ${0.6 * unitScale}`} />
              ))}
              {guides.labels.map((lb, i) => {
                const w = Math.max(4 * unitScale, lb.text.length * 1.4 * unitScale);
                return (
                  <g key={`lb${i}`}>
                    <rect x={lb.x - w / 2} y={lb.y - 1.3 * unitScale} width={w} height={2.4 * unitScale} rx={0.6 * unitScale} fill="#1F2937" opacity={0.9} />
                    <text x={lb.x} y={lb.y} textAnchor="middle" dominantBaseline="middle" fontSize={1.6 * unitScale} fill="#fff">
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
              strokeWidth={0.25 * unitScale}
              strokeDasharray={`${unitScale} ${0.6 * unitScale}`}
              style={{ pointerEvents: "none" }}
            />
          )}

          {/* Venue boundary perimeter — drawn LAST (on top of booths/
              features/guides) so it's never obscured by anything placed
              near the venue edge; non-interactive, so it never intercepts a
              click meant for a booth underneath. Renders the boundary's OWN
              shape (RECTANGLE included, deliberately distinct from the
              plain coordinate-box frame rect at the very top of this SVG —
              see requirement: never let the browser/canvas frame be
              mistaken for the real physical boundary) — the identical
              geometry isFootprintWithinBoundary enforces server-side and a
              CAD-imported polygon boundary is stored under, so an imported
              boundary renders through this exact same path, never a
              separate CAD-specific renderer. */}
          {showBoundary && (
            <g style={{ pointerEvents: "none" }}>
              {boundary.shape === "RECTANGLE" && (
                <rect x={0} y={0} width={viewBox.width} height={viewBox.height} fill="none" stroke={boundaryStrokeColor} strokeWidth={boundaryStrokeWidth} opacity={boundaryStrokeOpacity} />
              )}
              {boundary.shape === "CIRCLE" && (
                <circle cx={boundary.cx} cy={boundary.cy} r={boundary.r} fill="none" stroke={boundaryStrokeColor} strokeWidth={boundaryStrokeWidth} opacity={boundaryStrokeOpacity} />
              )}
              {boundary.shape === "OVAL" && (
                <ellipse cx={boundary.cx} cy={boundary.cy} rx={boundary.rx} ry={boundary.ry} fill="none" stroke={boundaryStrokeColor} strokeWidth={boundaryStrokeWidth} opacity={boundaryStrokeOpacity} />
              )}
              {boundary.shape === "POLYGON" && boundary.points.length >= 3 && (
                <polygon points={polygonPointsStr(boundary.points)} fill="none" stroke={boundaryStrokeColor} strokeWidth={boundaryStrokeWidth} opacity={boundaryStrokeOpacity} />
              )}
            </g>
          )}
        </svg>
      </div>
    </div>
  );
}
