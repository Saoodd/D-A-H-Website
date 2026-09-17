"use client";

// Venue Boundary step of the Floor Plan Setup Wizard — lets an admin define
// the venue's ACTUAL usable footprint (RECTANGLE | CIRCLE | OVAL | POLYGON),
// separate from the plain venueWidthMm x venueDepthMm coordinate box (see
// Event.venueShape/venueBoundaryJson in prisma/schema.prisma and the
// containment math in lib/floorplan/boundary.ts, which is the ONLY thing
// that actually enforces this boundary server-side on every booth write —
// this editor is presentation only, it just produces the shape params that
// enforcement reads).

import { useMemo, useRef, useState } from "react";
import {
  VenueBoundary,
  Point,
  parseVenueBoundary,
  serializeVenueBoundary,
  isFootprintWithinBoundary,
} from "@/lib/floorplan/boundary";
import { Button } from "@/components/ui/Button";

interface BoothFootprint {
  id: string;
  code: string;
  xMm: number | null;
  yMm: number | null;
  widthMm: number | null;
  depthMm: number | null;
  rotation: number | null;
}

interface Props {
  eventId: string;
  venueWidthMm: number;
  venueDepthMm: number;
  initialShape: string;
  initialBoundaryJson: string | null;
  booths?: BoothFootprint[];
  onSaved: (shape: string, boundaryJson: string | null) => void;
  onClose: () => void;
}

const SHAPES: { key: VenueBoundary["shape"]; label: string }[] = [
  { key: "RECTANGLE", label: "Rectangle (full venue)" },
  { key: "CIRCLE", label: "Circle" },
  { key: "OVAL", label: "Oval" },
  { key: "POLYGON", label: "Polygon" },
];

function defaultParamsFor(shape: VenueBoundary["shape"], venueWidthMm: number, venueDepthMm: number): VenueBoundary {
  const cx = venueWidthMm / 2;
  const cy = venueDepthMm / 2;
  if (shape === "CIRCLE") return { shape: "CIRCLE", cx, cy, r: Math.min(venueWidthMm, venueDepthMm) * 0.4 };
  if (shape === "OVAL") return { shape: "OVAL", cx, cy, rx: venueWidthMm * 0.4, ry: venueDepthMm * 0.4 };
  if (shape === "POLYGON") return { shape: "POLYGON", points: [] };
  return { shape: "RECTANGLE" };
}

export function VenueBoundaryEditor({ eventId, venueWidthMm, venueDepthMm, initialShape, initialBoundaryJson, booths, onSaved, onClose }: Props) {
  const [boundary, setBoundary] = useState<VenueBoundary>(() => parseVenueBoundary(initialShape, initialBoundaryJson));
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<{ kind: "center" | "radius" | "rx" | "ry" | "point"; index?: number } | null>(null);

  const viewMaxWidth = 560;
  const aspect = venueWidthMm / venueDepthMm;

  function clientToMm(clientX: number, clientY: number): Point | null {
    const svg = svgRef.current;
    if (!svg) return null;
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const loc = pt.matrixTransform(ctm.inverse());
    return { x: Math.min(venueWidthMm, Math.max(0, loc.x)), y: Math.min(venueDepthMm, Math.max(0, loc.y)) };
  }

  const violatingBooths = useMemo(() => {
    if (!booths || booths.length === 0) return [];
    const venue = { widthMm: venueWidthMm, depthMm: venueDepthMm, boundary };
    return booths.filter((b) => {
      if (b.xMm == null || b.yMm == null || b.widthMm == null || b.depthMm == null) return false;
      return !isFootprintWithinBoundary(venue, { xMm: b.xMm, yMm: b.yMm, widthMm: b.widthMm, depthMm: b.depthMm, rotationDeg: b.rotation ?? 0 });
    });
  }, [booths, boundary, venueWidthMm, venueDepthMm]);

  function onCanvasPointerDown(e: React.PointerEvent<SVGSVGElement>) {
    if (boundary.shape !== "POLYGON") return;
    // Clicking empty canvas while editing a polygon appends a new point —
    // dragging an existing point handle is handled by that handle's own
    // stopPropagation'd pointer-down instead.
    const pt = clientToMm(e.clientX, e.clientY);
    if (!pt) return;
    setBoundary((b) => (b.shape === "POLYGON" ? { ...b, points: [...b.points, pt] } : b));
  }

  function onHandlePointerDown(e: React.PointerEvent, kind: "center" | "radius" | "rx" | "ry" | "point", index?: number) {
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    dragRef.current = { kind, index };
  }

  function onHandlePointerMove(e: React.PointerEvent) {
    const drag = dragRef.current;
    if (!drag) return;
    const pt = clientToMm(e.clientX, e.clientY);
    if (!pt) return;
    setBoundary((b) => {
      if (b.shape === "CIRCLE") {
        if (drag.kind === "center") return { ...b, cx: pt.x, cy: pt.y };
        if (drag.kind === "radius") return { ...b, r: Math.max(1, Math.hypot(pt.x - b.cx, pt.y - b.cy)) };
      }
      if (b.shape === "OVAL") {
        if (drag.kind === "center") return { ...b, cx: pt.x, cy: pt.y };
        if (drag.kind === "rx") return { ...b, rx: Math.max(1, Math.abs(pt.x - b.cx)) };
        if (drag.kind === "ry") return { ...b, ry: Math.max(1, Math.abs(pt.y - b.cy)) };
      }
      if (b.shape === "POLYGON" && drag.kind === "point" && drag.index != null) {
        const points = b.points.slice();
        points[drag.index] = pt;
        return { ...b, points };
      }
      return b;
    });
  }

  function onHandlePointerUp() {
    dragRef.current = null;
  }

  function updateNumeric(patch: Partial<{ cx: number; cy: number; r: number; rx: number; ry: number }>) {
    setBoundary((b) => {
      if (b.shape === "CIRCLE") return { ...b, ...patch };
      if (b.shape === "OVAL") return { ...b, ...patch };
      return b;
    });
  }

  async function save() {
    if (boundary.shape === "POLYGON" && boundary.points.length < 3) {
      setNotice("A polygon boundary needs at least 3 points.");
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/events/${eventId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ venueShape: boundary.shape, venueBoundaryJson: serializeVenueBoundary(boundary) }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setNotice(j.error || "Couldn't save the venue boundary.");
        return;
      }
      onSaved(boundary.shape, serializeVenueBoundary(boundary));
    } finally {
      setBusy(false);
    }
  }

  const mm = (v: number) => (v / 1000).toFixed(2);

  return (
    <div className="rounded-[10px] border border-brown/10 bg-cream p-4 sm:p-5 mb-4">
      <div className="flex items-center justify-between mb-3">
        <p className="label-caps">Venue Boundary</p>
        <button type="button" onClick={onClose} className="text-xs text-brown-light underline">
          Close
        </button>
      </div>
      <p className="text-xs text-brown-light mb-3">
        Define the venue&apos;s actual usable shape. Booths can never be placed with any part of their footprint outside this boundary
        (a per-booth override exists for edge cases). Rectangle matches the full coordinate box — nothing to draw.
      </p>

      <div className="flex flex-wrap gap-1.5 mb-3">
        {SHAPES.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => setBoundary(boundary.shape === s.key ? boundary : defaultParamsFor(s.key, venueWidthMm, venueDepthMm))}
            className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${
              boundary.shape === s.key ? "bg-brown text-cream-soft border-brown" : "border-brown/25 text-brown-dark hover:bg-brown/5"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="flex flex-col md:flex-row gap-4 items-start">
        <div
          className="border border-brown/15 rounded-[8px] bg-cream-soft overflow-hidden touch-none"
          style={{ width: "100%", maxWidth: viewMaxWidth, aspectRatio: `${aspect}` }}
        >
          <svg
            ref={svgRef}
            width="100%"
            height="100%"
            viewBox={`0 0 ${venueWidthMm} ${venueDepthMm}`}
            onPointerDown={onCanvasPointerDown}
            onPointerMove={onHandlePointerMove}
            onPointerUp={onHandlePointerUp}
            onPointerLeave={onHandlePointerUp}
            className={boundary.shape === "POLYGON" ? "cursor-crosshair" : ""}
          >
            <rect x={0} y={0} width={venueWidthMm} height={venueDepthMm} fill="transparent" stroke="#DDD3C3" strokeWidth={venueWidthMm * 0.003} />

            {boundary.shape === "RECTANGLE" && (
              <rect
                x={venueWidthMm * 0.01}
                y={venueDepthMm * 0.01}
                width={venueWidthMm * 0.98}
                height={venueDepthMm * 0.98}
                fill="rgba(107,68,41,0.06)"
                stroke="#6B4429"
                strokeDasharray={`${venueWidthMm * 0.01} ${venueWidthMm * 0.008}`}
                strokeWidth={venueWidthMm * 0.003}
              />
            )}

            {boundary.shape === "CIRCLE" && (
              <>
                <circle cx={boundary.cx} cy={boundary.cy} r={boundary.r} fill="rgba(107,68,41,0.12)" stroke="#6B4429" strokeWidth={venueWidthMm * 0.003} />
                <circle
                  cx={boundary.cx}
                  cy={boundary.cy}
                  r={venueWidthMm * 0.012}
                  fill="#2E7D32"
                  onPointerDown={(e) => onHandlePointerDown(e, "center")}
                  className="cursor-move"
                />
                <circle
                  cx={boundary.cx + boundary.r}
                  cy={boundary.cy}
                  r={venueWidthMm * 0.012}
                  fill="#C97C4B"
                  onPointerDown={(e) => onHandlePointerDown(e, "radius")}
                  className="cursor-ew-resize"
                />
              </>
            )}

            {boundary.shape === "OVAL" && (
              <>
                <ellipse
                  cx={boundary.cx}
                  cy={boundary.cy}
                  rx={boundary.rx}
                  ry={boundary.ry}
                  fill="rgba(107,68,41,0.12)"
                  stroke="#6B4429"
                  strokeWidth={venueWidthMm * 0.003}
                />
                <circle
                  cx={boundary.cx}
                  cy={boundary.cy}
                  r={venueWidthMm * 0.012}
                  fill="#2E7D32"
                  onPointerDown={(e) => onHandlePointerDown(e, "center")}
                  className="cursor-move"
                />
                <circle
                  cx={boundary.cx + boundary.rx}
                  cy={boundary.cy}
                  r={venueWidthMm * 0.012}
                  fill="#C97C4B"
                  onPointerDown={(e) => onHandlePointerDown(e, "rx")}
                  className="cursor-ew-resize"
                />
                <circle
                  cx={boundary.cx}
                  cy={boundary.cy + boundary.ry}
                  r={venueWidthMm * 0.012}
                  fill="#C97C4B"
                  onPointerDown={(e) => onHandlePointerDown(e, "ry")}
                  className="cursor-ns-resize"
                />
              </>
            )}

            {boundary.shape === "POLYGON" && (
              <>
                {boundary.points.length >= 2 && (
                  <polygon
                    points={boundary.points.map((p) => `${p.x},${p.y}`).join(" ")}
                    fill="rgba(107,68,41,0.12)"
                    stroke="#6B4429"
                    strokeWidth={venueWidthMm * 0.003}
                  />
                )}
                {boundary.points.map((p, i) => (
                  <circle
                    key={i}
                    cx={p.x}
                    cy={p.y}
                    r={venueWidthMm * 0.012}
                    fill="#2E7D32"
                    onPointerDown={(e) => onHandlePointerDown(e, "point", i)}
                    className="cursor-move"
                  />
                ))}
              </>
            )}

            {violatingBooths.map((b) =>
              b.xMm != null && b.yMm != null && b.widthMm != null && b.depthMm != null ? (
                <rect
                  key={b.id}
                  x={b.xMm}
                  y={b.yMm}
                  width={b.widthMm}
                  height={b.depthMm}
                  transform={b.rotation ? `rotate(${b.rotation} ${b.xMm + b.widthMm / 2} ${b.yMm + b.depthMm / 2})` : undefined}
                  fill="none"
                  stroke="#B91C1C"
                  strokeWidth={venueWidthMm * 0.004}
                  strokeDasharray={`${venueWidthMm * 0.006} ${venueWidthMm * 0.006}`}
                />
              ) : null
            )}
          </svg>
        </div>

        <div className="flex-1 min-w-0 text-xs space-y-2">
          {boundary.shape === "CIRCLE" && (
            <div className="flex flex-wrap gap-2 items-center">
              <label className="flex items-center gap-1">
                Center X (m)
                <input type="number" step="0.1" value={mm(boundary.cx)} onChange={(e) => updateNumeric({ cx: Number(e.target.value) * 1000 })} className="w-20 border border-brown/20 rounded px-1.5 py-1 bg-cream-soft" />
              </label>
              <label className="flex items-center gap-1">
                Center Y (m)
                <input type="number" step="0.1" value={mm(boundary.cy)} onChange={(e) => updateNumeric({ cy: Number(e.target.value) * 1000 })} className="w-20 border border-brown/20 rounded px-1.5 py-1 bg-cream-soft" />
              </label>
              <label className="flex items-center gap-1">
                Radius (m)
                <input type="number" step="0.1" min="0.1" value={mm(boundary.r)} onChange={(e) => updateNumeric({ r: Math.max(100, Number(e.target.value) * 1000) })} className="w-20 border border-brown/20 rounded px-1.5 py-1 bg-cream-soft" />
              </label>
            </div>
          )}
          {boundary.shape === "OVAL" && (
            <div className="flex flex-wrap gap-2 items-center">
              <label className="flex items-center gap-1">
                Center X (m)
                <input type="number" step="0.1" value={mm(boundary.cx)} onChange={(e) => updateNumeric({ cx: Number(e.target.value) * 1000 })} className="w-20 border border-brown/20 rounded px-1.5 py-1 bg-cream-soft" />
              </label>
              <label className="flex items-center gap-1">
                Center Y (m)
                <input type="number" step="0.1" value={mm(boundary.cy)} onChange={(e) => updateNumeric({ cy: Number(e.target.value) * 1000 })} className="w-20 border border-brown/20 rounded px-1.5 py-1 bg-cream-soft" />
              </label>
              <label className="flex items-center gap-1">
                Radius X (m)
                <input type="number" step="0.1" min="0.1" value={mm(boundary.rx)} onChange={(e) => updateNumeric({ rx: Math.max(100, Number(e.target.value) * 1000) })} className="w-20 border border-brown/20 rounded px-1.5 py-1 bg-cream-soft" />
              </label>
              <label className="flex items-center gap-1">
                Radius Y (m)
                <input type="number" step="0.1" min="0.1" value={mm(boundary.ry)} onChange={(e) => updateNumeric({ ry: Math.max(100, Number(e.target.value) * 1000) })} className="w-20 border border-brown/20 rounded px-1.5 py-1 bg-cream-soft" />
              </label>
            </div>
          )}
          {boundary.shape === "POLYGON" && (
            <div className="space-y-2">
              <p className="text-brown-light">Click inside the canvas to add points ({boundary.points.length} so far, 3+ needed). Drag a point to adjust it.</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setBoundary((b) => (b.shape === "POLYGON" ? { ...b, points: b.points.slice(0, -1) } : b))}
                  disabled={boundary.points.length === 0}
                  className="px-2.5 py-1 rounded-lg border border-brown/25 disabled:opacity-40"
                >
                  Undo last point
                </button>
                <button
                  type="button"
                  onClick={() => setBoundary((b) => (b.shape === "POLYGON" ? { ...b, points: [] } : b))}
                  disabled={boundary.points.length === 0}
                  className="px-2.5 py-1 rounded-lg border border-brown/25 disabled:opacity-40"
                >
                  Clear
                </button>
              </div>
            </div>
          )}
          {boundary.shape === "RECTANGLE" && <p className="text-brown-light">Nothing to configure — the boundary is the full venue rectangle.</p>}

          {violatingBooths.length > 0 && (
            <p className="text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-2">
              ⚠ {violatingBooths.length} existing booth{violatingBooths.length === 1 ? "" : "s"} would fall outside this boundary (outlined in red above): {violatingBooths.map((b) => b.code).join(", ")}.
              Saving is still allowed — move them or set a per-booth boundary override afterward.
            </p>
          )}

          {notice && <p className="text-red-700">{notice}</p>}

          <div className="flex gap-2 pt-1">
            <Button type="button" size="sm" onClick={save} loading={busy}>
              Save Boundary
            </Button>
            <Button type="button" size="sm" variant="secondary" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
