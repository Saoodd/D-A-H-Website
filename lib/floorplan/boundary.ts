// Venue boundary containment geometry — the ONE place that decides whether
// a booth's full physical footprint (including its rotation) lies inside
// the venue's actual usable shape. Deliberately separate from the venue's
// rectangular coordinate bounding box (venueWidthMm x venueDepthMm): a
// CIRCLE/OVAL/POLYGON venue's real boundary is smaller than that box, so a
// footprint can pass the box check and still fail the shape check.
//
// Pure math, no framework/DB imports — usable both client-side (instant
// preview feedback while dragging) and server-side (the authoritative
// re-check every create/move/resize/rotate/Mass-Create/import path must
// call before writing geometry — see requirement: frontend is presentation
// only).

export interface Point {
  x: number;
  y: number;
}

export type VenueBoundary =
  | { shape: "RECTANGLE" }
  | { shape: "CIRCLE"; cx: number; cy: number; r: number }
  | { shape: "OVAL"; cx: number; cy: number; rx: number; ry: number }
  | { shape: "POLYGON"; points: Point[] };

export interface VenueBox {
  widthMm: number;
  depthMm: number;
  boundary: VenueBoundary;
}

export interface FootprintMm {
  xMm: number; // top-left corner, BEFORE rotation (matches Booth.xMm/gridX convention)
  yMm: number;
  widthMm: number;
  depthMm: number;
  rotationDeg?: number; // degrees, rotates around the footprint's own center
}

const EPS = 1e-6;

/** The 4 corners of a (possibly rotated) rectangle, in venue mm space. */
function rectCorners(f: FootprintMm): Point[] {
  const cx = f.xMm + f.widthMm / 2;
  const cy = f.yMm + f.depthMm / 2;
  const hw = f.widthMm / 2;
  const hh = f.depthMm / 2;
  const rad = ((f.rotationDeg ?? 0) * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const local: Point[] = [
    { x: -hw, y: -hh },
    { x: hw, y: -hh },
    { x: hw, y: hh },
    { x: -hw, y: hh },
  ];
  return local.map((p) => ({
    x: cx + p.x * cos - p.y * sin,
    y: cy + p.x * sin + p.y * cos,
  }));
}

/** Standard ray-casting point-in-polygon test. */
function pointInPolygon(pt: Point, poly: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x,
      yi = poly[i].y;
    const xj = poly[j].x,
      yj = poly[j].y;
    const intersect = yi > pt.y !== yj > pt.y && pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function segmentsIntersect(a1: Point, a2: Point, b1: Point, b2: Point): boolean {
  const d = (p: Point, q: Point, r: Point) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const d1 = d(b1, b2, a1);
  const d2 = d(b1, b2, a2);
  const d3 = d(a1, a2, b1);
  const d4 = d(a1, a2, b2);
  return ((d1 > EPS && d2 < -EPS) || (d1 < -EPS && d2 > EPS)) && ((d3 > EPS && d4 < -EPS) || (d3 < -EPS && d4 > EPS));
}

/** Catches a rectangle whose 4 corners all happen to land inside a concave
 *  polygon's hull while an edge of the rectangle actually crosses OUT
 *  through a notch — corner-only containment would wrongly pass that case. */
function rectCrossesPolygonEdges(corners: Point[], poly: Point[]): boolean {
  for (let i = 0; i < 4; i++) {
    const a1 = corners[i];
    const a2 = corners[(i + 1) % 4];
    for (let j = 0; j < poly.length; j++) {
      const b1 = poly[j];
      const b2 = poly[(j + 1) % poly.length];
      if (segmentsIntersect(a1, a2, b1, b2)) return true;
    }
  }
  return false;
}

/** True when the ENTIRE rotated footprint lies within `venue`'s actual
 *  boundary shape — never just its rectangular coordinate box. This is the
 *  single check every geometry-writing path (manual placement, drag/
 *  resize/rotate, Mass Create, CAD/JSON import) must call before persisting
 *  a booth's position, with BOUNDARY_VIOLATION_MESSAGE as the default
 *  blocking message and Booth.boundaryOverride as the only bypass. */
export function isFootprintWithinBoundary(venue: VenueBox, footprint: FootprintMm): boolean {
  const corners = rectCorners(footprint);
  const withinBox = corners.every(
    (c) => c.x >= -EPS && c.x <= venue.widthMm + EPS && c.y >= -EPS && c.y <= venue.depthMm + EPS
  );
  if (!withinBox) return false;

  switch (venue.boundary.shape) {
    case "RECTANGLE":
      return true; // boundary IS the coordinate box — already checked above
    case "CIRCLE": {
      const { cx, cy, r } = venue.boundary;
      if (r <= 0) return false;
      return corners.every((c) => Math.hypot(c.x - cx, c.y - cy) <= r + EPS);
    }
    case "OVAL": {
      const { cx, cy, rx, ry } = venue.boundary;
      if (rx <= 0 || ry <= 0) return false;
      return corners.every((c) => ((c.x - cx) / rx) ** 2 + ((c.y - cy) / ry) ** 2 <= 1 + EPS);
    }
    case "POLYGON": {
      const poly = venue.boundary.points;
      if (poly.length < 3) return true; // not yet drawn — nothing to enforce
      if (!corners.every((c) => pointInPolygon(c, poly))) return false;
      return !rectCrossesPolygonEdges(corners, poly);
    }
    default:
      return true;
  }
}

export const BOUNDARY_VIOLATION_MESSAGE = "Part of this booth is outside the venue boundary.";

/** Parses Event.venueShape/venueBoundaryJson into a typed VenueBoundary.
 *  Falls back to RECTANGLE for missing/malformed data — never throws, since
 *  a boundary-check caller must always get a usable (if permissive) shape
 *  rather than crash a booth create/move over corrupt JSON. */
export function parseVenueBoundary(shape: string | null | undefined, boundaryJson: string | null | undefined): VenueBoundary {
  try {
    if (shape === "CIRCLE" && boundaryJson) {
      const p = JSON.parse(boundaryJson) as { cx: number; cy: number; r: number };
      if (typeof p.cx === "number" && typeof p.cy === "number" && typeof p.r === "number") {
        return { shape: "CIRCLE", cx: p.cx, cy: p.cy, r: p.r };
      }
    } else if (shape === "OVAL" && boundaryJson) {
      const p = JSON.parse(boundaryJson) as { cx: number; cy: number; rx: number; ry: number };
      if (typeof p.cx === "number" && typeof p.cy === "number" && typeof p.rx === "number" && typeof p.ry === "number") {
        return { shape: "OVAL", cx: p.cx, cy: p.cy, rx: p.rx, ry: p.ry };
      }
    } else if (shape === "POLYGON" && boundaryJson) {
      const p = JSON.parse(boundaryJson) as { points: Point[] };
      if (Array.isArray(p.points)) {
        return { shape: "POLYGON", points: p.points };
      }
    }
  } catch {
    // Malformed JSON — fall through to RECTANGLE below.
  }
  return { shape: "RECTANGLE" };
}

export function serializeVenueBoundary(boundary: VenueBoundary): string | null {
  if (boundary.shape === "RECTANGLE") return null;
  if (boundary.shape === "CIRCLE") return JSON.stringify({ cx: boundary.cx, cy: boundary.cy, r: boundary.r });
  if (boundary.shape === "OVAL") return JSON.stringify({ cx: boundary.cx, cy: boundary.cy, rx: boundary.rx, ry: boundary.ry });
  return JSON.stringify({ points: boundary.points });
}
