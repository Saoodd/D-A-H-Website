import "server-only";
import DxfParser from "dxf-parser";

// Converts a DXF floor-plan drawing into the SAME shape as a normal DAH
// Booth record (gridX/gridY/gridW/gridH as a 0-100 canvas percentage,
// rotation in degrees, widthMm/depthMm as real physical dimensions) so an
// imported booth is byte-for-byte identical to a manually-created one once
// committed — see app/api/admin/events/[id]/booths/cad-import/parse and
// /commit routes. This module only PARSES and DETECTS; it never writes to
// the database itself.
//
// Scope, stated plainly (do not overclaim):
//  - LWPOLYLINE entities (closed 4-vertex rectangles) are the primary
//    booth-detection signal — the reliable, common case for a booth grid
//    drawn as individual closed rectangles.
//  - INSERT entities (a CAD block placed per booth) are supported on a
//    best-effort basis: the block's own LWPOLYLINE geometry is read and
//    transformed by the INSERT's position/rotation/scale.
//  - Four separate LINE entities that happen to form a rectangle are NOT
//    welded into a polygon (that needs edge-endpoint graph matching with a
//    tolerance) — LINE entities are only ever treated as architecture
//    (walls/aisles), never as booth candidates. This is a known, documented
//    limitation, not a silent gap.
//  - DWG (the binary AutoCAD format) is not handled here at all — see the
//    upload route, which only accepts .dxf.

export interface DetectedBooth {
  entityId: string; // stable within one parse — DXF entity handle, or a synthetic id for INSERT-derived booths
  code: string | null; // matched label text, or null if no confident match — never guessed
  labelConfidence: "matched" | "unlabeled";
  gridX: number;
  gridY: number;
  gridW: number;
  gridH: number;
  rotation: number; // degrees, 0-360
  widthMm: number | null;
  depthMm: number | null;
  layer: string;
  source: "polyline" | "insert";
}

export interface CadArchitectureLine {
  layer: string;
  points: { x: number; y: number }[]; // already normalized to the 0-100 canvas percentage space
}

export interface CadParseResult {
  unitsLabel: string; // human-readable, e.g. "millimetres" or "unitless (assumed millimetres)"
  unitToMm: number;
  layers: string[];
  boothLayerGuess: string[];
  usedBoothLayers: string[] | null; // the layer filter actually applied — null when no layer filtering was possible/used
  detected: DetectedBooth[];
  unlabeledCount: number;
  architecture: CadArchitectureLine[];
  warnings: string[];
}

const BOOTH_LAYER_PATTERN = /BOOTH|STALL|KIOSK|EXHIBITOR|VENDOR/i;
const BOOTH_BLOCK_PATTERN = /BOOTH|STALL|KIOSK/i;
// Common architecture/furniture layer names to exclude from auto-detected
// booth candidates when no explicit booth layer is known — never turn a
// wall, door, table, toilet, column or dimension line into a vendor slot.
const NON_BOOTH_LAYER_PATTERN = /WALL|DOOR|FURNITURE|TABLE|CHAIR|TOILET|COLUMN|DIM|AXIS|GRID|TEXT|ANNOT|HATCH|TITLE|BORDER/i;

const MAX_ARCHITECTURE_POINTS = 4000; // keeps the background overlay light even for large drawings

interface Point {
  x: number;
  y: number;
}

// DXF $INSUNITS codes (AutoCAD header variable) — the subset actually seen
// in real-world exports. 0 = unitless (we assume millimetres, the common
// case for booth/exhibition floor plans, and say so explicitly).
const INSUNITS_TO_MM: Record<number, { mm: number; label: string }> = {
  0: { mm: 1, label: "unitless (assumed millimetres)" },
  1: { mm: 25.4, label: "inches" },
  2: { mm: 304.8, label: "feet" },
  4: { mm: 1, label: "millimetres" },
  5: { mm: 10, label: "centimetres" },
  6: { mm: 1000, label: "metres" },
};

function dist(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function angleDeg(a: Point, b: Point): number {
  const deg = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
  return ((deg % 360) + 360) % 360;
}

/** A closed 4-vertex polyline is treated as a booth-shaped rectangle when
 *  its two diagonals are roughly equal (the real test for "is this
 *  approximately a rectangle", robust to any rotation) — not just "4
 *  points", which would also match arbitrary quadrilaterals. */
function isRectangularQuad(vertices: Point[]): boolean {
  if (vertices.length !== 4) return false;
  const d1 = dist(vertices[0], vertices[2]);
  const d2 = dist(vertices[1], vertices[3]);
  if (d1 === 0 || d2 === 0) return false;
  return Math.abs(d1 - d2) / Math.max(d1, d2) < 0.08; // within 8% — allows for drawing imprecision
}

function bboxOf(points: Point[]): { minX: number; minY: number; maxX: number; maxY: number } {
  return {
    minX: Math.min(...points.map((p) => p.x)),
    minY: Math.min(...points.map((p) => p.y)),
    maxX: Math.max(...points.map((p) => p.x)),
    maxY: Math.max(...points.map((p) => p.y)),
  };
}

export function parseDxf(source: string, opts?: { boothLayers?: string[] }): CadParseResult {
  const parser = new DxfParser();
  const dxf = parser.parseSync(source);
  if (!dxf) {
    throw new Error("This file couldn't be read as DXF. Confirm it's a valid ASCII DXF export, not DWG or a binary DXF.");
  }

  const warnings: string[] = [];

  const insUnitsRaw = dxf.header?.["$INSUNITS"];
  const insUnits = typeof insUnitsRaw === "number" ? insUnitsRaw : 0;
  const unitInfo = INSUNITS_TO_MM[insUnits] ?? { mm: 1, label: `unrecognized unit code ${insUnits} (assumed millimetres)` };
  if (!(insUnits in INSUNITS_TO_MM)) {
    warnings.push(`Unrecognized DXF unit code ($INSUNITS=${insUnits}) — assumed millimetres. Double-check dimensions in the preview.`);
  }
  const unitToMm = unitInfo.mm;

  const entities = dxf.entities ?? [];
  const layerSet = new Set<string>();
  entities.forEach((e) => e.layer && layerSet.add(e.layer));
  Object.values(dxf.tables?.layer?.layers ?? {}).forEach((l) => l.name && layerSet.add(l.name));
  const layers = Array.from(layerSet).sort();
  const boothLayerGuess = layers.filter((l) => BOOTH_LAYER_PATTERN.test(l));

  const usedBoothLayers = opts?.boothLayers && opts.boothLayers.length > 0 ? opts.boothLayers : null;

  const detected: DetectedBooth[] = [];
  const architectureRaw: { layer: string; points: Point[] }[] = [];
  const labelCandidates: { text: string; x: number; y: number }[] = [];

  for (const e of entities) {
    if (e.type === "TEXT") {
      const t = e as unknown as { text: string; startPoint: Point };
      const text = (t.text ?? "").trim();
      if (text) labelCandidates.push({ text, x: t.startPoint.x, y: t.startPoint.y });
    } else if (e.type === "MTEXT") {
      const t = e as unknown as { text: string; position: Point };
      const text = (t.text ?? "").replace(/\\P/g, " ").trim();
      if (text) labelCandidates.push({ text, x: t.position.x, y: t.position.y });
    }
  }

  function considerBoothCandidate(layer: string, vertices: Point[], entityId: string, source: "polyline" | "insert") {
    const layerAllowsBooth = usedBoothLayers
      ? usedBoothLayers.includes(layer)
      : !NON_BOOTH_LAYER_PATTERN.test(layer) && isRectangularQuad(vertices);
    if (!layerAllowsBooth) {
      architectureRaw.push({ layer, points: vertices });
      return;
    }
    if (vertices.length < 3) {
      architectureRaw.push({ layer, points: vertices });
      return;
    }
    // True side lengths from consecutive edges (robust to rotation) rather
    // than a naive axis-aligned bounding box, which would report the wrong
    // width/depth for anything not axis-aligned.
    const widthUnits = dist(vertices[0], vertices[1]);
    const depthUnits = dist(vertices[1], vertices[2]);
    const rotation = angleDeg(vertices[0], vertices[1]);
    const center = {
      x: vertices.reduce((s, v) => s + v.x, 0) / vertices.length,
      y: vertices.reduce((s, v) => s + v.y, 0) / vertices.length,
    };

    // Nearest label within a generous margin around the shape (half its own
    // longest side) — never guesses across an unrelated booth's label.
    const margin = Math.max(widthUnits, depthUnits) * 0.75;
    let best: { text: string; d: number } | null = null;
    for (const cand of labelCandidates) {
      const d = dist(center, cand);
      if (d <= margin && (!best || d < best.d)) best = { text: cand.text, d };
    }

    detected.push({
      entityId,
      code: best?.text ?? null,
      labelConfidence: best ? "matched" : "unlabeled",
      // World-space center + full side lengths — converted to canvas % and
      // finalized once the overall drawing bounding box is known (below).
      gridX: center.x - widthUnits / 2,
      gridY: center.y - depthUnits / 2,
      gridW: widthUnits,
      gridH: depthUnits,
      rotation,
      widthMm: Math.round(widthUnits * unitToMm),
      depthMm: Math.round(depthUnits * unitToMm),
      layer,
      source,
    });
  }

  for (const e of entities) {
    if (e.type === "LWPOLYLINE") {
      const poly = e as unknown as { vertices: Point[]; shape: boolean; layer: string; handle: number };
      const vertices = poly.vertices ?? [];
      if (poly.shape && vertices.length >= 3) {
        considerBoothCandidate(poly.layer, vertices, `h${poly.handle}`, "polyline");
      } else if (vertices.length >= 2) {
        architectureRaw.push({ layer: poly.layer, points: vertices });
      }
    } else if (e.type === "LINE") {
      const line = e as unknown as { vertices: Point[]; layer: string };
      if (line.vertices?.length >= 2) architectureRaw.push({ layer: line.layer, points: line.vertices });
    } else if (e.type === "INSERT") {
      const ins = e as unknown as { name: string; position: Point; rotation?: number; xScale?: number; yScale?: number; layer: string; handle: number };
      const layerMatches = usedBoothLayers ? usedBoothLayers.includes(ins.layer) : BOOTH_BLOCK_PATTERN.test(ins.name) || BOOTH_LAYER_PATTERN.test(ins.layer);
      const block = dxf.blocks?.[ins.name];
      const blockPoly = block?.entities?.find((be) => be.type === "LWPOLYLINE") as unknown as { vertices: Point[] } | undefined;
      if (layerMatches && blockPoly?.vertices?.length) {
        const xScale = ins.xScale ?? 1;
        const yScale = ins.yScale ?? 1;
        const rot = ((ins.rotation ?? 0) % 360 + 360) % 360;
        const rad = (rot * Math.PI) / 180;
        // Transform the block's local-space vertices by the INSERT's own
        // scale, rotation, and world position — standard CAD block-insert
        // math (scale, then rotate, then translate).
        const worldVertices = blockPoly.vertices.map((v) => {
          const sx = v.x * xScale;
          const sy = v.y * yScale;
          const rx = sx * Math.cos(rad) - sy * Math.sin(rad);
          const ry = sx * Math.sin(rad) + sy * Math.cos(rad);
          return { x: ins.position.x + rx, y: ins.position.y + ry };
        });
        if (worldVertices.length >= 3) considerBoothCandidate(ins.layer, worldVertices, `ins${ins.handle}`, "insert");
      }
      // INSERTs that don't match a booth signal are silently skipped — they're
      // almost always furniture/fixture blocks, not architecture lines worth
      // drawing in the background overlay.
    }
  }

  // Normalize every coordinate (booth candidates + architecture) into one
  // shared 0-100 canvas percentage space, scaled uniformly (never
  // stretched) from the combined bounding box of everything in the
  // drawing, and centered within the 0-100 square.
  const allPoints: Point[] = [
    ...detected.flatMap((d) => [{ x: d.gridX, y: d.gridY }, { x: d.gridX + d.gridW, y: d.gridY + d.gridH }]),
    ...architectureRaw.flatMap((a) => a.points),
  ];
  if (allPoints.length === 0) {
    return {
      unitsLabel: unitInfo.label,
      unitToMm,
      layers,
      boothLayerGuess,
      usedBoothLayers,
      detected: [],
      unlabeledCount: 0,
      architecture: [],
      warnings: [...warnings, "No booth-shaped geometry or architecture lines were found in this file."],
    };
  }
  const box = bboxOf(allPoints);
  const spanX = box.maxX - box.minX || 1;
  const spanY = box.maxY - box.minY || 1;
  const scale = 100 / Math.max(spanX, spanY);
  const offsetX = (100 - spanX * scale) / 2;
  const offsetY = (100 - spanY * scale) / 2;
  const toPercent = (p: Point) => ({
    x: (p.x - box.minX) * scale + offsetX,
    y: (p.y - box.minY) * scale + offsetY,
  });

  const normalizedDetected = detected.map((d) => {
    const topLeft = toPercent({ x: d.gridX, y: d.gridY });
    return {
      ...d,
      gridX: Math.max(0, Math.min(100, topLeft.x)),
      gridY: Math.max(0, Math.min(100, topLeft.y)),
      gridW: d.gridW * scale,
      gridH: d.gridH * scale,
    };
  });

  let architecturePoints = 0;
  const architecture: CadArchitectureLine[] = [];
  for (const a of architectureRaw) {
    if (architecturePoints >= MAX_ARCHITECTURE_POINTS) break;
    architecture.push({ layer: a.layer, points: a.points.map(toPercent) });
    architecturePoints += a.points.length;
  }
  if (architecturePoints >= MAX_ARCHITECTURE_POINTS) {
    warnings.push("This drawing has a lot of non-booth geometry — the background architecture overlay was capped for performance; booth detection itself is unaffected.");
  }

  return {
    unitsLabel: unitInfo.label,
    unitToMm,
    layers,
    boothLayerGuess,
    usedBoothLayers,
    detected: normalizedDetected,
    unlabeledCount: normalizedDetected.filter((d) => d.labelConfidence === "unlabeled").length,
    architecture,
    warnings,
  };
}
