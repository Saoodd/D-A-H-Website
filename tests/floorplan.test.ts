// Floor-plan regression suite: the pure geometry every surface shares
// (admin builder, vendor selector, Booking Review, Terms map, View Booking)
// plus the CAD/JSON importers. If one of these fails, a floor plan somewhere
// renders, validates or imports differently than it did.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  computeBackgroundRect,
  getFloorplanViewBox,
  gridRectToMm,
  hasConfirmedScale,
  mmToGridRect,
  scaleFromTwoPointCalibration,
  worldPatchToServerPatch,
  worldRectOf,
} from "../lib/floorplan/transform";
import { boundaryExtentMm, isFootprintWithinBoundary, parseVenueBoundary, serializeVenueBoundary, type VenueBox } from "../lib/floorplan/boundary";
import { checkBoothFit, checkMultiBoothFit, isProvablyAdjacent } from "../lib/boothFit";
import { parseFloorplanImportJson } from "../lib/floorplanImport";
import { parseDxf } from "../lib/cadImport";

const venue = { venueWidthMm: 30000, venueDepthMm: 20000 };

test("viewBox: real mm once scale is confirmed, legacy 100x100 otherwise", () => {
  assert.deepEqual(getFloorplanViewBox({ venueScaleConfirmed: true, ...venue }), { width: 30000, height: 20000, mode: "MM" });
  assert.deepEqual(getFloorplanViewBox({ venueScaleConfirmed: false, ...venue }), { width: 100, height: 100, mode: "LEGACY_PERCENT" });
  assert.equal(hasConfirmedScale({ venueScaleConfirmed: true, venueWidthMm: 0, venueDepthMm: 100 }), false);
  assert.equal(hasConfirmedScale({ venueScaleConfirmed: true, venueWidthMm: null, venueDepthMm: 100 }), false);
});

test("mm <-> grid percentages round-trip without drift", () => {
  const mm = { xMm: 4500, yMm: 3000, widthMm: 3000, depthMm: 2000 };
  const grid = mmToGridRect(venue, mm);
  assert.deepEqual(grid, { gridX: 15, gridY: 15, gridW: 10, gridH: 10 });
  assert.deepEqual(gridRectToMm(venue, grid), mm);
});

test("worldRectOf prefers real mm, falls back to grid, and never mixes units", () => {
  const item = { gridX: 10, gridY: 20, gridW: 5, gridH: 5, xMm: 100, yMm: 200, widthMm: 3000, depthMm: 2000 };
  assert.deepEqual(worldRectOf(item, "LEGACY_PERCENT", venue), { x: 10, y: 20, w: 5, h: 5 });
  assert.deepEqual(worldRectOf(item, "MM", venue), { x: 100, y: 200, w: 3000, h: 2000 });
  assert.deepEqual(worldRectOf({ ...item, xMm: null }, "MM", venue), { x: 3000, y: 4000, w: 1500, h: 1000 });
});

test("drag/resize patches reach the server under the right field names", () => {
  const patch = { gridX: 1234.4, gridW: 3000.6, priceAedFils: 100000, rotation: 90 };
  // Legacy: percentages pass straight through.
  assert.deepEqual(worldPatchToServerPatch(patch, "LEGACY_PERCENT"), patch);
  // MM: viewBox units become mm fields, rounded; an mm value is never sent as gridX.
  const out = worldPatchToServerPatch(patch, "MM");
  assert.deepEqual(out, { xMm: 1234, widthMm: 3001, priceAedFils: 100000, rotation: 90 });
  assert.equal("gridX" in out, false);
});

test("background image scales uniformly (never stretched) and centres by default", () => {
  const r = computeBackgroundRect(venue, { naturalWidthPx: 2000, naturalHeightPx: 1000, offsetXMm: null, offsetYMm: null, scale: null, rotationDeg: null })!;
  assert.equal(r.width / r.height, 2); // image aspect ratio preserved
  assert.equal(r.width, 30000); // "contain" fit to the wider side
  assert.equal(r.y, (20000 - 15000) / 2);
  assert.equal(computeBackgroundRect(venue, { naturalWidthPx: null, naturalHeightPx: 1, offsetXMm: 0, offsetYMm: 0, scale: 1, rotationDeg: 0 }), null);
  assert.equal(scaleFromTwoPointCalibration(500, 10000), 20);
  assert.equal(scaleFromTwoPointCalibration(0, 10000), 0);
});

test("boundary: rectangle, rotation, circle, oval", () => {
  const rect: VenueBox = { widthMm: 10000, depthMm: 10000, boundary: { shape: "RECTANGLE" } };
  assert.equal(isFootprintWithinBoundary(rect, { xMm: 0, yMm: 0, widthMm: 10000, depthMm: 10000 }), true); // exactly on the edge
  assert.equal(isFootprintWithinBoundary(rect, { xMm: 8000, yMm: 0, widthMm: 3000, depthMm: 2000 }), false);
  // Fits unrotated in the corner, but a 45° turn swings its corners outside.
  assert.equal(isFootprintWithinBoundary(rect, { xMm: 0, yMm: 0, widthMm: 3000, depthMm: 3000 }), true);
  assert.equal(isFootprintWithinBoundary(rect, { xMm: 0, yMm: 0, widthMm: 3000, depthMm: 3000, rotationDeg: 45 }), false);

  const circle: VenueBox = { widthMm: 10000, depthMm: 10000, boundary: { shape: "CIRCLE", cx: 5000, cy: 5000, r: 5000 } };
  assert.equal(isFootprintWithinBoundary(circle, { xMm: 4000, yMm: 4000, widthMm: 2000, depthMm: 2000 }), true);
  assert.equal(isFootprintWithinBoundary(circle, { xMm: 0, yMm: 0, widthMm: 1000, depthMm: 1000 }), false); // inside the box, outside the circle

  const oval: VenueBox = { widthMm: 20000, depthMm: 10000, boundary: { shape: "OVAL", cx: 10000, cy: 5000, rx: 10000, ry: 5000 } };
  assert.equal(isFootprintWithinBoundary(oval, { xMm: 8000, yMm: 4000, widthMm: 4000, depthMm: 2000 }), true);
  assert.equal(isFootprintWithinBoundary(oval, { xMm: 0, yMm: 0, widthMm: 2000, depthMm: 2000 }), false);
});

test("boundary: concave polygon catches a booth crossing the notch", () => {
  // A U shape: the notch is x 4000-6000, y 0-6000.
  const u: VenueBox = {
    widthMm: 10000,
    depthMm: 10000,
    boundary: { shape: "POLYGON", points: [{ x: 0, y: 0 }, { x: 4000, y: 0 }, { x: 4000, y: 6000 }, { x: 6000, y: 6000 }, { x: 6000, y: 0 }, { x: 10000, y: 0 }, { x: 10000, y: 10000 }, { x: 0, y: 10000 }] },
  };
  assert.equal(isFootprintWithinBoundary(u, { xMm: 500, yMm: 500, widthMm: 3000, depthMm: 3000 }), true);
  assert.equal(isFootprintWithinBoundary(u, { xMm: 4500, yMm: 1000, widthMm: 1000, depthMm: 1000 }), false); // inside the notch
  // All four corners are inside the U, but the booth spans across the notch.
  assert.equal(isFootprintWithinBoundary(u, { xMm: 3000, yMm: 2000, widthMm: 4000, depthMm: 1000 }), false);
});

test("boundary JSON parse/serialize round-trips and never throws on bad data", () => {
  for (const b of [
    { shape: "CIRCLE" as const, cx: 1, cy: 2, r: 3 },
    { shape: "OVAL" as const, cx: 1, cy: 2, rx: 3, ry: 4 },
    { shape: "POLYGON" as const, points: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }] },
  ]) {
    assert.deepEqual(parseVenueBoundary(b.shape, serializeVenueBoundary(b)), b);
  }
  assert.deepEqual(parseVenueBoundary("CIRCLE", "{not json"), { shape: "RECTANGLE" });
  assert.deepEqual(parseVenueBoundary("OVAL", '{"cx":"a"}'), { shape: "RECTANGLE" });
  assert.equal(serializeVenueBoundary({ shape: "RECTANGLE" }), null);
  assert.deepEqual(boundaryExtentMm({ shape: "CIRCLE", cx: 5000, cy: 5000, r: 2000 }, 10000, 10000), { minX: 3000, minY: 3000, maxX: 7000, maxY: 7000 });
});

test("booth fit: straight, rotated, unknown, too big", () => {
  const booth = { widthMm: 3000, depthMm: 2000 };
  assert.deepEqual(checkBoothFit({ widthMm: 2500, depthMm: 1500 }, booth), { status: "FITS", rotated: false });
  assert.deepEqual(checkBoothFit({ widthMm: 1500, depthMm: 2800 }, booth), { status: "FITS", rotated: true });
  assert.deepEqual(checkBoothFit({ widthMm: null, depthMm: 1500 }, booth), { status: "UNKNOWN" });
  assert.deepEqual(checkBoothFit({ widthMm: 3500, depthMm: 2500 }, booth), { status: "DOES_NOT_FIT" });
  assert.deepEqual(checkMultiBoothFit({ widthMm: 5000, depthMm: 2000 }, [booth, booth]), { anyFits: false, anyUnknown: false, needsCombinedSpaceCaution: true });
  assert.equal(checkMultiBoothFit({ widthMm: 2000, depthMm: 2000 }, [booth, booth]).needsCombinedSpaceCaution, false);
});

test("adjacency: shared edge yes, aisle no, missing geometry no", () => {
  const a = { xMm: 0, yMm: 0, widthMm: 3000, depthMm: 2000 };
  assert.equal(isProvablyAdjacent(a, { xMm: 3000, yMm: 0, widthMm: 3000, depthMm: 2000 }), true);
  assert.equal(isProvablyAdjacent(a, { xMm: 3200, yMm: 0, widthMm: 3000, depthMm: 2000 }), true); // within the 300 mm tolerance
  assert.equal(isProvablyAdjacent(a, { xMm: 5000, yMm: 0, widthMm: 3000, depthMm: 2000 }), false); // 2 m aisle
  assert.equal(isProvablyAdjacent(a, { xMm: 3000, yMm: 0, widthMm: null, depthMm: 2000 }), false);
  assert.equal(isProvablyAdjacent(a, { xMm: 3000, yMm: 0, widthMm: 3000, depthMm: 2000, rotationDeg: 45 }), false);
});

test("adjacency: 90°-rotated booths turn about their centre, like the renderer", () => {
  // 3000x2000 booth at x=0 turned 90°: its real extent is x 500..2500.
  const turned = { xMm: 0, yMm: 0, widthMm: 3000, depthMm: 2000, rotationDeg: 90 };
  // Touching its real right edge (2500) -> adjacent. (Anchoring the turned
  // span at x=0 put its right edge at 2000, a 500 mm "gap", and said no.)
  assert.equal(isProvablyAdjacent(turned, { xMm: 2500, yMm: 0, widthMm: 2000, depthMm: 2000 }), true);
  // 1 m clear of its real right edge -> not adjacent.
  assert.equal(isProvablyAdjacent(turned, { xMm: 3500, yMm: 0, widthMm: 2000, depthMm: 2000 }), false);
});

test("JSON layout import: valid file and specific rejections", () => {
  const ok = parseFloorplanImportJson(
    JSON.stringify({ version: 1, venue: { widthMm: 30000, depthMm: 20000 }, booths: [{ code: "A1", widthMm: 3000, depthMm: 2000, xMm: 0, yMm: 0, rotation: -90 }] }),
  );
  assert.equal(ok.ok, true);
  if (ok.ok) assert.equal(ok.doc.booths[0].rotation, 270); // normalised to 0-359
  const bad = (doc: unknown) => parseFloorplanImportJson(JSON.stringify(doc));
  assert.equal(parseFloorplanImportJson("{oops").ok, false);
  assert.equal(bad({ version: 2, booths: [] }).ok, false);
  assert.equal(bad({ version: 1, booths: [] }).ok, false);
  assert.equal(bad({ version: 1, booths: [{ code: "A1", widthMm: 3000, depthMm: 2000, xMm: 0, yMm: 0 }, { code: "A1", widthMm: 3000, depthMm: 2000, xMm: 0, yMm: 0 }] }).ok, false);
  assert.equal(bad({ version: 1, booths: [{ code: "A1", widthMm: -1, depthMm: 2000, xMm: 0, yMm: 0 }] }).ok, false);
});

test("CAD (DXF) import: units, labels, sizes and y-up orientation", () => {
  // Two 3 m x 2 m booths along the bottom of a 6 m x 5 m drawing, a wall
  // along the top, "A1" labelled. DXF is y-up, so "bottom" is y = 0.
  const src = readFileSync(new URL("./fixtures/two-booths.dxf", import.meta.url), "utf8");
  const r = parseDxf(src, { venue: { widthMm: 6000, depthMm: 5000 } });
  assert.equal(r.unitsLabel, "millimetres");
  assert.deepEqual(r.boothLayerGuess, ["BOOTHS"]);
  assert.equal(r.detected.length, 2);
  const [a1, other] = [...r.detected].sort((x, y) => (x.xMm ?? 0) - (y.xMm ?? 0));
  assert.equal(a1.code, "A1");
  assert.equal(other.code, null); // never guesses a label
  assert.equal(r.unlabeledCount, 1);
  assert.deepEqual([a1.widthMm, a1.depthMm], [3000, 2000]);
  // Screen orientation: booths at the bottom (y 3000-5000), wall at the top.
  assert.deepEqual([a1.xMm, a1.yMm, other.xMm, other.yMm], [0, 3000, 3000, 3000]);
  assert.ok(r.architecture[0].points.every((p) => p.y < 20), "wall should be near the top of the canvas");
  // Without a confirmed venue, no mm position is fabricated.
  assert.equal(parseDxf(src).detected[0].xMm, null);
});

test("CAD (DXF) import: a booth drawn at +30° (counter-clockwise, y-up) renders at 330° (SVG clockwise)", () => {
  const rad = (30 * Math.PI) / 180;
  const pts = [
    [0, 0],
    [3000, 0],
    [3000, 2000],
    [0, 2000],
  ].map(([x, y]) => [x * Math.cos(rad) - y * Math.sin(rad), x * Math.sin(rad) + y * Math.cos(rad)]);
  const lines = ["0", "SECTION", "2", "HEADER", "9", "$INSUNITS", "70", "4", "0", "ENDSEC", "0", "SECTION", "2", "ENTITIES", "0", "LWPOLYLINE", "5", "1A", "8", "BOOTHS", "90", "4", "70", "1"];
  for (const [x, y] of pts) lines.push("10", String(x), "20", String(y));
  lines.push("0", "ENDSEC", "0", "EOF");
  const r = parseDxf(lines.join("\n") + "\n");
  assert.equal(r.detected.length, 1);
  assert.equal(Math.round(r.detected[0].rotation), 330);
  assert.deepEqual([r.detected[0].widthMm, r.detected[0].depthMm], [3000, 2000]);
});
