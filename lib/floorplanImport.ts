import "server-only";

// The "DAH Floor Plan JSON" import format — a versioned, documented,
// mm-authoritative alternative to CAD import for events that already have
// (or are given) a floor plan as structured data rather than a DXF
// drawing: an admin hand-writing a layout, a spreadsheet-to-JSON export, or
// a re-export of a floor plan built in this tool for a different DAH
// instance/event. Deliberately mirrors DetectedBooth's shape in
// lib/cadImport.ts (mm-first: xMm/yMm/widthMm/depthMm as the source of
// truth, gridX/Y/W/H always DERIVED, never accepted directly here) so both
// import paths feed the exact same commit route
// (app/api/admin/events/[id]/floorplan/cad-import/commit) with rows in the
// same shape — "reuse CAD-import's safe-reimport modes," not a second
// implementation of newOnly/matchUpdate/replace.
//
// version 1 (current):
// {
//   "version": 1,
//   "venue": { "widthMm": 30000, "depthMm": 20000 },   // optional, informational — see below
//   "booths": [
//     { "code": "B1", "widthMm": 3000, "depthMm": 2000, "xMm": 1000, "yMm": 1000, "rotation": 0 },
//     ...
//   ]
// }
//
// Field notes:
//  - "venue", if present, is NEVER applied to the event automatically — the
//    only thing it's used for here is a sanity-check warning if it doesn't
//    match the event's own declared venueWidthMm/venueDepthMm. Confirming
//    physical scale stays a deliberate, explicit admin action (Floor Plan
//    Setup Wizard's Physical Scale step) — an import file can never set it
//    as a side effect.
//  - Every booth needs a non-empty "code", real widthMm/depthMm (both > 0),
//    and real xMm/yMm (>= 0) — this format has no legacy percentage
//    fallback; it's intentionally always mm, unlike CAD import's synthetic-
//    canvas fallback for an unconfirmed-scale event (there's no drawing to
//    fit here, so there's nothing sensible to fall back to). Importing into
//    an event without a confirmed physical scale is rejected with a clear
//    error telling the admin to confirm scale first.
//  - "rotation" is optional, defaults to 0, degrees.
//  - Anything beyond these fields on a booth object is ignored, not an
//    error — forward-compatible with a future version 2 that adds more
//    (price, color, tier) without breaking a version-1 file.

export interface FloorplanImportBooth {
  code: string;
  widthMm: number;
  depthMm: number;
  xMm: number;
  yMm: number;
  rotation?: number;
}

export interface FloorplanImportDocument {
  version: 1;
  venue?: { widthMm: number; depthMm: number };
  booths: FloorplanImportBooth[];
}

export type FloorplanImportParseResult =
  | { ok: true; doc: FloorplanImportDocument }
  | { ok: false; error: string };

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/** Validates raw parsed JSON against the version-1 schema above. Never
 *  throws — every rejection is a clear, specific error string suitable for
 *  showing directly in the Import Layout Data preview UI. */
export function parseFloorplanImportJson(raw: string): FloorplanImportParseResult {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { ok: false, error: "That's not valid JSON — check for a missing comma, bracket, or quote." };
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return { ok: false, error: "The top level of a DAH Floor Plan JSON file must be an object, e.g. { \"version\": 1, \"booths\": [...] }." };
  }
  const obj = data as Record<string, unknown>;

  if (obj.version !== 1) {
    return { ok: false, error: `Unsupported or missing "version" — this importer currently only understands version 1. Got: ${JSON.stringify(obj.version)}.` };
  }

  let venue: { widthMm: number; depthMm: number } | undefined;
  if (obj.venue !== undefined) {
    if (typeof obj.venue !== "object" || obj.venue === null) {
      return { ok: false, error: '"venue" must be an object with widthMm and depthMm, e.g. { "widthMm": 30000, "depthMm": 20000 }.' };
    }
    const v = obj.venue as Record<string, unknown>;
    if (!isFiniteNumber(v.widthMm) || v.widthMm <= 0 || !isFiniteNumber(v.depthMm) || v.depthMm <= 0) {
      return { ok: false, error: '"venue.widthMm" and "venue.depthMm" must both be positive numbers.' };
    }
    venue = { widthMm: v.widthMm, depthMm: v.depthMm };
  }

  if (!Array.isArray(obj.booths) || obj.booths.length === 0) {
    return { ok: false, error: '"booths" must be a non-empty array.' };
  }

  const booths: FloorplanImportBooth[] = [];
  const seenCodes = new Set<string>();
  for (let i = 0; i < obj.booths.length; i++) {
    const raw = obj.booths[i];
    const where = `booths[${i}]`;
    if (typeof raw !== "object" || raw === null) {
      return { ok: false, error: `${where} must be an object.` };
    }
    const b = raw as Record<string, unknown>;
    const code = typeof b.code === "string" ? b.code.trim() : "";
    if (!code) return { ok: false, error: `${where}.code is required and must be a non-empty string.` };
    if (seenCodes.has(code)) return { ok: false, error: `Duplicate booth code "${code}" — every code must be unique within the file.` };
    seenCodes.add(code);

    if (!isFiniteNumber(b.widthMm) || b.widthMm <= 0) return { ok: false, error: `${where} ("${code}").widthMm must be a positive number (millimetres).` };
    if (!isFiniteNumber(b.depthMm) || b.depthMm <= 0) return { ok: false, error: `${where} ("${code}").depthMm must be a positive number (millimetres).` };
    if (!isFiniteNumber(b.xMm) || b.xMm < 0) return { ok: false, error: `${where} ("${code}").xMm must be a number >= 0 (millimetres).` };
    if (!isFiniteNumber(b.yMm) || b.yMm < 0) return { ok: false, error: `${where} ("${code}").yMm must be a number >= 0 (millimetres).` };
    const rotation = b.rotation === undefined ? 0 : b.rotation;
    if (!isFiniteNumber(rotation)) return { ok: false, error: `${where} ("${code}").rotation must be a number when present.` };

    booths.push({ code, widthMm: b.widthMm, depthMm: b.depthMm, xMm: b.xMm, yMm: b.yMm, rotation: ((Math.round(rotation) % 360) + 360) % 360 });
  }

  return { ok: true, doc: { version: 1, venue, booths } };
}
