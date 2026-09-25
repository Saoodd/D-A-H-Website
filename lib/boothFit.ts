// Booth size-compatibility check — compares a vendor's declared setup
// footprint against a booth's physical footprint, both in millimeters
// (never formatted strings like "3x2" — see Application.setupWidthMm/
// setupDepthMm and Booth.widthMm/depthMm comments in schema.prisma).
//
// Rotation is allowed by default: a setup that doesn't fit in its given
// orientation but WOULD fit turned 90 degrees counts as fitting. There is
// no per-booth override for this yet (see schema comment on Booth) —
// every booth currently allows rotation.

export type FitResult =
  | { status: "UNKNOWN" } // one or both sides of the comparison aren't set yet
  | { status: "FITS"; rotated: boolean }
  | { status: "DOES_NOT_FIT" };

export function checkBoothFit(
  setup: { widthMm: number | null; depthMm: number | null },
  booth: { widthMm: number | null; depthMm: number | null }
): FitResult {
  if (setup.widthMm == null || setup.depthMm == null || booth.widthMm == null || booth.depthMm == null) {
    return { status: "UNKNOWN" };
  }
  const straightFits = setup.widthMm <= booth.widthMm && setup.depthMm <= booth.depthMm;
  if (straightFits) return { status: "FITS", rotated: false };

  const rotatedFits = setup.widthMm <= booth.depthMm && setup.depthMm <= booth.widthMm;
  if (rotatedFits) return { status: "FITS", rotated: true };

  return { status: "DOES_NOT_FIT" };
}

/** For a multi-booth selection: per the product decision that we never
 *  promise a combined-space fit without reliable adjacency geometry (grid
 *  percentages don't correspond to real physical size — see FloorPlan
 *  comments), a setup that doesn't fit within ANY single selected booth
 *  is neither blocked nor confirmed — it's flagged for the vendor to
 *  confirm with DAH directly. A setup that DOES fit within at least one
 *  of the selected booths needs no such caution. */
export function checkMultiBoothFit(
  setup: { widthMm: number | null; depthMm: number | null },
  booths: { widthMm: number | null; depthMm: number | null }[]
): { anyFits: boolean; anyUnknown: boolean; needsCombinedSpaceCaution: boolean } {
  const results = booths.map((b) => checkBoothFit(setup, b));
  const anyFits = results.some((r) => r.status === "FITS");
  const anyUnknown = results.some((r) => r.status === "UNKNOWN");
  // Only caution when we have a definite answer for every booth and none
  // of them fit alone — if any dimension is simply unknown, we already
  // can't make any claim at all, so no extra "spans both" caution on top.
  const allDefinitelyDoNotFit = results.length > 0 && results.every((r) => r.status === "DOES_NOT_FIT");
  return { anyFits, anyUnknown, needsCombinedSpaceCaution: allDefinitelyDoNotFit };
}

export interface PositionedFootprint {
  xMm?: number | null;
  yMm?: number | null;
  widthMm?: number | null;
  depthMm?: number | null;
  rotationDeg?: number | null;
}

// Generous enough to cover a shared partition wall or no-aisle divider
// between two booths (never exactly 0mm in real floor plans due to
// measurement/drawing tolerance), tight enough that two booths with a
// genuine aisle between them never count as adjacent.
const ADJACENCY_TOLERANCE_MM = 300;

/** True ONLY when two booths' real-world footprints can be geometrically
 *  PROVEN to share an edge — an aligned side within ADJACENCY_TOLERANCE_MM,
 *  with real overlap along that side — never inferred from booth codes,
 *  list order, or canvas/percentage proximity. Requires both booths to
 *  have real mm position AND size, and to be axis-aligned (rotation a
 *  multiple of 90°); missing geometry or an off-axis rotation
 *  conservatively returns false rather than guessing. This is the one
 *  place the product's "never promise adjacency we can't prove" rule
 *  (see checkMultiBoothFit above) is actually decided — callers must show
 *  a generic "please confirm with DAH" message whenever this returns
 *  false for a multi-booth selection, never assume two selected booths
 *  combine into one usable space. */
export function isProvablyAdjacent(a: PositionedFootprint, b: PositionedFootprint): boolean {
  if (a.xMm == null || a.yMm == null || a.widthMm == null || a.depthMm == null) return false;
  if (b.xMm == null || b.yMm == null || b.widthMm == null || b.depthMm == null) return false;

  const normalizeRot = (deg: number | null | undefined) => ((Math.round(deg ?? 0) % 360) + 360) % 360;
  const rotA = normalizeRot(a.rotationDeg);
  const rotB = normalizeRot(b.rotationDeg);
  if (![0, 90, 180, 270].includes(rotA) || ![0, 90, 180, 270].includes(rotB)) return false;

  // At a 90/270 rotation, width and depth swap for the purpose of the
  // axis-aligned bounding span — the footprint itself is still a plain
  // rectangle since only 90-degree multiples are accepted above.
  const spanOf = (widthMm: number, depthMm: number, rot: number) => (rot === 90 || rot === 270 ? { w: depthMm, h: widthMm } : { w: widthMm, h: depthMm });
  const spanA = spanOf(a.widthMm, a.depthMm, rotA);
  const spanB = spanOf(b.widthMm, b.depthMm, rotB);

  // xMm/yMm are the top-left BEFORE rotation and booths rotate about their
  // own centre (FloorPlan.tsx, lib/floorplan/boundary.ts), so the rotated
  // span is centred on the same point, not anchored at xMm/yMm. At 0/180
  // this is identical to xMm..xMm+width.
  const aCx = a.xMm + a.widthMm / 2;
  const aCy = a.yMm + a.depthMm / 2;
  const bCx = b.xMm + b.widthMm / 2;
  const bCy = b.yMm + b.depthMm / 2;
  const aLeft = aCx - spanA.w / 2;
  const aRight = aCx + spanA.w / 2;
  const aTop = aCy - spanA.h / 2;
  const aBottom = aCy + spanA.h / 2;
  const bLeft = bCx - spanB.w / 2;
  const bRight = bCx + spanB.w / 2;
  const bTop = bCy - spanB.h / 2;
  const bBottom = bCy + spanB.h / 2;

  const yOverlap = Math.min(aBottom, bBottom) - Math.max(aTop, bTop);
  const xOverlap = Math.min(aRight, bRight) - Math.max(aLeft, bLeft);

  const sharesVerticalEdge = yOverlap > 0 && (Math.abs(aRight - bLeft) <= ADJACENCY_TOLERANCE_MM || Math.abs(bRight - aLeft) <= ADJACENCY_TOLERANCE_MM);
  const sharesHorizontalEdge = xOverlap > 0 && (Math.abs(aBottom - bTop) <= ADJACENCY_TOLERANCE_MM || Math.abs(bBottom - aTop) <= ADJACENCY_TOLERANCE_MM);

  return sharesVerticalEdge || sharesHorizontalEdge;
}
