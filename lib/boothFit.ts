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
