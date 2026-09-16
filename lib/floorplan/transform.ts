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
