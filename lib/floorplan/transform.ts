// The one authoritative world(mm)->viewport transform, shared identically
// by the admin builder, vendor selector, Booking Review, Terms map preview,
// and View Booking (components/floorplan/FloorPlan.tsx). Only permissions/
// highlighting differ between those surfaces — the geometry math is this
// module, never reimplemented per page.
//
// Pipeline: REAL-WORLD GEOMETRY (mm, stored on Booth/FloorPlanFeature/Event)
// -> viewBox (this file picks its size) -> rendered pixels (the SVG's own
// viewBox scaling, plus a CSS transform for pan/zoom layered on top in
// components/floorplan/FloorPlan.tsx). Pan/zoom only ever change the CSS
// transform — they never read or write xMm/yMm/widthMm/depthMm, so zoom can
// never alter stored physical dimensions.
//
// Once an event's physical scale is confirmed, the viewBox IS the venue in
// real millimetres (width=venueWidthMm, height=venueDepthMm) — booths and
// features render with their mm fields directly as SVG user units, so the
// venue's true aspect ratio is preserved automatically (unlike the legacy
// fixed 100x100 square, which forced every venue's rendered footprint into
// a square regardless of its real proportions). Before scale is confirmed,
// this falls back to that legacy 100x100 percentage canvas so every
// pre-existing event keeps rendering exactly as it does today, labeled
// "Venue Scale Needs Configuration" rather than guessing real size from old
// percentage data — see requirement: legacy floor plans must degrade
// safely, never silently.

export interface ScaleFields {
  venueScaleConfirmed: boolean;
  venueWidthMm: number | null;
  venueDepthMm: number | null;
}

export type ConfirmedScaleFields = ScaleFields & { venueWidthMm: number; venueDepthMm: number };

export function hasConfirmedScale(event: ScaleFields): event is ConfirmedScaleFields {
  return (
    event.venueScaleConfirmed &&
    event.venueWidthMm != null &&
    event.venueDepthMm != null &&
    event.venueWidthMm > 0 &&
    event.venueDepthMm > 0
  );
}

export type FloorplanMode = "MM" | "LEGACY_PERCENT";

export interface FloorplanViewBox {
  width: number;
  height: number;
  mode: FloorplanMode;
}

/** The SVG viewBox size to render this event's floor plan at. */
export function getFloorplanViewBox(event: ScaleFields): FloorplanViewBox {
  if (hasConfirmedScale(event)) {
    return { width: event.venueWidthMm, height: event.venueDepthMm, mode: "MM" };
  }
  return { width: 100, height: 100, mode: "LEGACY_PERCENT" };
}

export interface MmRect {
  xMm: number;
  yMm: number;
  widthMm: number;
  depthMm: number;
}

export interface GridRect {
  gridX: number;
  gridY: number;
  gridW: number;
  gridH: number;
}

interface VenueSize {
  venueWidthMm: number;
  venueDepthMm: number;
}

/** Derives the legacy gridX/Y/W/H percentage fields from real mm geometry.
 *  Booth.gridX/Y/W/H stay NOT NULL at the DB level for backward
 *  compatibility with every existing row/consumer, so a confirmed-scale
 *  event still needs them populated — this is now the ONLY place that ever
 *  computes them; nothing should hand-edit gridX/Y/W/H directly once an
 *  event has venueScaleConfirmed. This is also the concrete fix for the
 *  historical bug where a booth's rendered size (gridW/gridH) had no
 *  relationship to its real widthMm/depthMm (e.g. Mass Create always
 *  rendering a fixed 6%x6% square regardless of entered meters) — every
 *  write path must route through this function instead of hardcoding a
 *  default grid size. */
export function mmToGridRect(venue: VenueSize, mm: MmRect): GridRect {
  return {
    gridX: (mm.xMm / venue.venueWidthMm) * 100,
    gridY: (mm.yMm / venue.venueDepthMm) * 100,
    gridW: (mm.widthMm / venue.venueWidthMm) * 100,
    gridH: (mm.depthMm / venue.venueDepthMm) * 100,
  };
}

/** Inverse of mmToGridRect — for one-time legacy backfill / best-effort
 *  approximate display only (e.g. showing a plausible size before an admin
 *  recalibrates a legacy event), never used as an authoritative write once
 *  a real widthMm/depthMm exists. */
export function gridRectToMm(venue: VenueSize, grid: GridRect): MmRect {
  return {
    xMm: Math.round((grid.gridX / 100) * venue.venueWidthMm),
    yMm: Math.round((grid.gridY / 100) * venue.venueDepthMm),
    widthMm: Math.round((grid.gridW / 100) * venue.venueWidthMm),
    depthMm: Math.round((grid.gridH / 100) * venue.venueDepthMm),
  };
}

export interface WorldRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A booth/feature-shaped object carrying both the legacy grid fields and
 *  the mm-authoritative ones — loose on purpose so it accepts raw Booth/
 *  FloorPlanFeature rows or their API DTOs without extra mapping. */
export interface GeometryFields {
  gridX: number;
  gridY: number;
  gridW: number;
  gridH: number;
  xMm?: number | null;
  yMm?: number | null;
  widthMm?: number | null;
  depthMm?: number | null;
}

/** Resolves an item's rect into CURRENT VIEWBOX UNITS — the single function
 *  every render/manipulation path that needs a world-space rect should go
 *  through instead of reading gridX/Y/W/H directly, now that those stay
 *  0-100 percentages forever (see mmToGridRect above) regardless of mode.
 *  In LEGACY_PERCENT mode this is just gridX/Y/W/H unchanged. In MM mode,
 *  uses the item's own xMm/yMm/widthMm/depthMm when all four are present
 *  (the normal case for anything created/moved once scale is confirmed);
 *  falls back to deriving an approximate mm rect from gridX/Y/W/H via
 *  gridRectToMm for an item that predates scale confirmation and hasn't
 *  been touched since — never authoritative, just a reasonable placement
 *  until it's next moved/saved and a write path persists real mm for it. */
export function worldRectOf(item: GeometryFields, mode: FloorplanMode, venue: VenueSize): WorldRect {
  if (mode === "LEGACY_PERCENT") {
    return { x: item.gridX, y: item.gridY, w: item.gridW, h: item.gridH };
  }
  if (item.xMm != null && item.yMm != null && item.widthMm != null && item.depthMm != null) {
    return { x: item.xMm, y: item.yMm, w: item.widthMm, h: item.depthMm };
  }
  const mm = gridRectToMm(venue, { gridX: item.gridX, gridY: item.gridY, gridW: item.gridW, gridH: item.gridH });
  return { x: mm.xMm, y: mm.yMm, w: mm.widthMm, h: mm.depthMm };
}

/** Converts a PARTIAL geometry patch expressed in CURRENT VIEWBOX UNITS
 *  (gridX/gridY/gridW/gridH keys, valued in percent in legacy mode or real
 *  mm once scale is confirmed — exactly what FloorPlan.tsx's own drag/
 *  resize/rotate math emits, since it's already fully viewBox-parametric)
 *  into the field names a booth/feature PATCH or POST body actually
 *  expects for that mode: passthrough in legacy mode, or
 *  gridX->xMm/gridY->yMm/gridW->widthMm/gridH->depthMm in MM mode — NEVER
 *  send a raw gridX holding an mm value under the name "gridX": the server
 *  always treats that field as a 0-100 percentage regardless of mode (see
 *  mmToGridRect). Every other key in the patch (price, color, rotation,
 *  status, ...) passes through unchanged. */
export function worldPatchToServerPatch(patch: Record<string, unknown>, mode: FloorplanMode): Record<string, unknown> {
  if (mode === "LEGACY_PERCENT") return patch;
  const { gridX, gridY, gridW, gridH, ...rest } = patch;
  const out: Record<string, unknown> = { ...rest };
  if (gridX !== undefined) out.xMm = Math.round(gridX as number);
  if (gridY !== undefined) out.yMm = Math.round(gridY as number);
  if (gridW !== undefined) out.widthMm = Math.round(gridW as number);
  if (gridH !== undefined) out.depthMm = Math.round(gridH as number);
  return out;
}

export interface BackgroundAlignment {
  naturalWidthPx: number | null;
  naturalHeightPx: number | null;
  offsetXMm: number | null;
  offsetYMm: number | null;
  scale: number | null;
  rotationDeg: number | null;
}

export interface BackgroundRect {
  x: number;
  y: number;
  width: number;
  height: number;
  rotationDeg: number;
}

/** Computes the background image's placement rect in the SAME coordinate
 *  space as getFloorplanViewBox (mm once scale is confirmed) from Event's
 *  venueBackground* alignment fields. `scale` is a SINGLE uniform scalar —
 *  there is deliberately no separate x/y scale factor anywhere in this
 *  model — so the image can never be stretched non-uniformly; this is the
 *  actual fix for the historical `preserveAspectRatio="none"` distortion
 *  bug, not a CSS-only patch. Falls back to a "contain"-style auto-fit
 *  (uniformly scaled to fit entirely inside the venue box, centered) when
 *  the admin hasn't explicitly aligned/locked it yet, matching the
 *  wizard's "Fit" default. */
export function computeBackgroundRect(venue: VenueSize, bg: BackgroundAlignment): BackgroundRect | null {
  if (!bg.naturalWidthPx || !bg.naturalHeightPx) return null;
  const fitScale = Math.min(venue.venueWidthMm / bg.naturalWidthPx, venue.venueDepthMm / bg.naturalHeightPx);
  const scale = bg.scale && bg.scale > 0 ? bg.scale : fitScale;
  const width = bg.naturalWidthPx * scale;
  const height = bg.naturalHeightPx * scale;
  const offsetX = bg.offsetXMm ?? (venue.venueWidthMm - width) / 2;
  const offsetY = bg.offsetYMm ?? (venue.venueDepthMm - height) / 2;
  return { x: offsetX, y: offsetY, width, height, rotationDeg: bg.rotationDeg ?? 0 };
}

/** mm-per-pixel scale that makes a known real-world distance between two
 *  clicked image points come out correctly — the second of the two required
 *  calibration methods (the first being direct venue-size entry, handled by
 *  just setting venueWidthMm/venueDepthMm directly). `pixelDistance` is the
 *  distance in the image's own natural pixels between the two clicked
 *  points; `realDistanceMm` is what the admin says that distance really is. */
export function scaleFromTwoPointCalibration(pixelDistance: number, realDistanceMm: number): number {
  if (pixelDistance <= 0) return 0;
  return realDistanceMm / pixelDistance;
}
