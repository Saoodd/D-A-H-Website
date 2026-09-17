"use client";

// Background Alignment step of the Floor Plan Setup Wizard — lets an admin
// precisely place the venue photo/drawing within the real mm coordinate
// box (offset/uniform-scale/rotate/lock), rather than relying on the naive
// "contain, centered" auto-fit FloorPlan.tsx falls back to. Reuses the
// shared FloorPlan renderer itself for the live preview (never a second,
// divergent rendering path — same requirement as everywhere else in this
// floor-plan system: one geometry, one renderer).

import { useEffect, useRef, useState } from "react";
import { FloorPlan } from "@/components/floorplan/FloorPlan";
import { scaleFromTwoPointCalibration } from "@/lib/floorplan/transform";
import { Button } from "@/components/ui/Button";

interface Alignment {
  naturalWidthPx: number | null;
  naturalHeightPx: number | null;
  offsetXMm: number | null;
  offsetYMm: number | null;
  scale: number | null;
  rotationDeg: number;
  locked: boolean;
}

interface Props {
  eventId: string;
  venueWidthMm: number;
  venueDepthMm: number;
  imageUrl: string;
  initial: Alignment;
  onSaved: (next: Alignment) => void;
  onClose: () => void;
}

export function BackgroundAlignmentEditor({ eventId, venueWidthMm, venueDepthMm, imageUrl, initial, onSaved, onClose }: Props) {
  const [alignment, setAlignment] = useState<Alignment>(initial);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [calibrateMode, setCalibrateMode] = useState(false);
  const [calibratePoints, setCalibratePoints] = useState<{ x: number; y: number }[]>([]);
  const [calibrateDistanceM, setCalibrateDistanceM] = useState("");
  const calibrateSvgRef = useRef<SVGSVGElement>(null);

  // Measure the image's natural pixel size once (needed by computeBackgroundRect
  // for both the uniform-scale math and the calibration canvas below) —
  // only when it isn't already known from a prior alignment.
  useEffect(() => {
    if (alignment.naturalWidthPx && alignment.naturalHeightPx) return;
    const img = new Image();
    img.onload = () => {
      setAlignment((a) => ({ ...a, naturalWidthPx: img.naturalWidth, naturalHeightPx: img.naturalHeight }));
    };
    img.src = imageUrl;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-time measurement of the fixed imageUrl prop
  }, [imageUrl]);

  function resetToFit() {
    setAlignment((a) => ({ ...a, offsetXMm: null, offsetYMm: null, scale: null, rotationDeg: 0, locked: false }));
  }

  function calibrateClientToPx(clientX: number, clientY: number) {
    const svg = calibrateSvgRef.current;
    if (!svg || !alignment.naturalWidthPx || !alignment.naturalHeightPx) return null;
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const loc = pt.matrixTransform(ctm.inverse());
    return { x: loc.x, y: loc.y };
  }

  function applyCalibration() {
    const realM = Number(calibrateDistanceM);
    if (calibratePoints.length !== 2 || !realM || realM <= 0) {
      setNotice("Click two points on the image and enter the real distance between them before applying.");
      return;
    }
    const [p1, p2] = calibratePoints;
    const pixelDistance = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    const scale = scaleFromTwoPointCalibration(pixelDistance, realM * 1000);
    if (scale <= 0) {
      setNotice("Those two points are too close together to calibrate from.");
      return;
    }
    setAlignment((a) => ({ ...a, scale }));
    setCalibrateMode(false);
    setCalibratePoints([]);
    setCalibrateDistanceM("");
    setNotice(`Scale calibrated: 1 image pixel = ${(scale * 1000).toFixed(3)}mm.`);
  }

  async function save() {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/events/${eventId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          venueBackgroundNaturalWidthPx: alignment.naturalWidthPx,
          venueBackgroundNaturalHeightPx: alignment.naturalHeightPx,
          venueBackgroundOffsetXMm: alignment.offsetXMm,
          venueBackgroundOffsetYMm: alignment.offsetYMm,
          venueBackgroundScale: alignment.scale,
          venueBackgroundRotationDeg: alignment.rotationDeg,
          venueBackgroundLocked: alignment.locked,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setNotice(j.error || "Couldn't save the background alignment.");
        return;
      }
      onSaved(alignment);
    } finally {
      setBusy(false);
    }
  }

  const mm = (v: number | null) => (v != null ? (v / 1000).toFixed(2) : "");

  return (
    <div className="rounded-[10px] border border-brown/10 bg-cream p-4 sm:p-5 mb-4">
      <div className="flex items-center justify-between mb-3">
        <p className="label-caps">Background Alignment</p>
        <button type="button" onClick={onClose} className="text-xs text-brown-light underline">
          Close
        </button>
      </div>
      <p className="text-xs text-brown-light mb-3">
        Position the floor plan photo/drawing precisely within the venue&apos;s real dimensions — a single uniform scale, so it&apos;s
        never stretched. Leave offset/scale blank to auto-fit (centered, scaled to fit entirely inside the venue).
      </p>

      {calibrateMode ? (
        <div className="space-y-2">
          <p className="text-xs text-brown-light">Click two points on the image that you know the real-world distance between, then enter that distance.</p>
          <div className="border border-brown/15 rounded-[8px] bg-cream-soft overflow-hidden" style={{ maxWidth: 560, aspectRatio: alignment.naturalWidthPx && alignment.naturalHeightPx ? `${alignment.naturalWidthPx} / ${alignment.naturalHeightPx}` : "1" }}>
            {alignment.naturalWidthPx && alignment.naturalHeightPx && (
              <svg
                ref={calibrateSvgRef}
                width="100%"
                height="100%"
                viewBox={`0 0 ${alignment.naturalWidthPx} ${alignment.naturalHeightPx}`}
                className="cursor-crosshair"
                onPointerDown={(e) => {
                  const pt = calibrateClientToPx(e.clientX, e.clientY);
                  if (!pt) return;
                  setCalibratePoints((pts) => (pts.length >= 2 ? [pt] : [...pts, pt]));
                }}
              >
                <image href={imageUrl} x={0} y={0} width={alignment.naturalWidthPx} height={alignment.naturalHeightPx} />
                {calibratePoints.length === 2 && (
                  <line x1={calibratePoints[0].x} y1={calibratePoints[0].y} x2={calibratePoints[1].x} y2={calibratePoints[1].y} stroke="#2E7D32" strokeWidth={alignment.naturalWidthPx! * 0.003} />
                )}
                {calibratePoints.map((p, i) => (
                  <circle key={i} cx={p.x} cy={p.y} r={alignment.naturalWidthPx! * 0.008} fill="#2E7D32" />
                ))}
              </svg>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <label className="flex items-center gap-1">
              Real distance between points (m)
              <input type="number" step="0.01" min="0.01" value={calibrateDistanceM} onChange={(e) => setCalibrateDistanceM(e.target.value)} className="w-20 border border-brown/20 rounded px-1.5 py-1 bg-cream-soft" />
            </label>
            <Button type="button" size="sm" onClick={applyCalibration}>
              Apply calibration
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => {
                setCalibrateMode(false);
                setCalibratePoints([]);
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col md:flex-row gap-4 items-start">
          <div className="border border-brown/15 rounded-[8px] overflow-hidden" style={{ width: "100%", maxWidth: 420, aspectRatio: `${venueWidthMm} / ${venueDepthMm}` }}>
            <FloorPlan
              features={[]}
              booths={[]}
              sizeStyles={{}}
              backgroundImageUrl={imageUrl}
              interactive={false}
              viewBox={{ width: venueWidthMm, height: venueDepthMm }}
              coordinateMode="MM"
              backgroundAlignment={alignment}
            />
          </div>

          <div className="flex-1 min-w-0 text-xs space-y-2">
            <div className="flex flex-wrap gap-2 items-center">
              <label className="flex items-center gap-1">
                Offset X (m)
                <input type="number" step="0.1" value={mm(alignment.offsetXMm)} placeholder="auto" onChange={(e) => setAlignment((a) => ({ ...a, offsetXMm: e.target.value === "" ? null : Number(e.target.value) * 1000 }))} className="w-20 border border-brown/20 rounded px-1.5 py-1 bg-cream-soft" />
              </label>
              <label className="flex items-center gap-1">
                Offset Y (m)
                <input type="number" step="0.1" value={mm(alignment.offsetYMm)} placeholder="auto" onChange={(e) => setAlignment((a) => ({ ...a, offsetYMm: e.target.value === "" ? null : Number(e.target.value) * 1000 }))} className="w-20 border border-brown/20 rounded px-1.5 py-1 bg-cream-soft" />
              </label>
              <label className="flex items-center gap-1">
                Rotation (°)
                <input type="number" step="1" value={alignment.rotationDeg} onChange={(e) => setAlignment((a) => ({ ...a, rotationDeg: Number(e.target.value) || 0 }))} className="w-16 border border-brown/20 rounded px-1.5 py-1 bg-cream-soft" />
              </label>
            </div>
            <label className="flex items-center gap-1">
              Scale (mm per image pixel)
              <input
                type="number"
                step="0.01"
                min="0.001"
                placeholder="auto-fit"
                value={alignment.scale != null ? (alignment.scale * 1000).toFixed(3) : ""}
                onChange={(e) => setAlignment((a) => ({ ...a, scale: e.target.value === "" ? null : Number(e.target.value) / 1000 }))}
                className="w-28 border border-brown/20 rounded px-1.5 py-1 bg-cream-soft"
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={resetToFit} className="px-2.5 py-1 rounded-lg border border-brown/25">
                Reset to Fit
              </button>
              <button type="button" onClick={() => setCalibrateMode(true)} disabled={!alignment.naturalWidthPx} className="px-2.5 py-1 rounded-lg border border-brown/25 disabled:opacity-40">
                Calibrate from two points
              </button>
            </div>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={alignment.locked} onChange={(e) => setAlignment((a) => ({ ...a, locked: e.target.checked }))} />
              Lock alignment (prevents accidental changes)
            </label>

            {notice && <p className="text-red-700">{notice}</p>}

            <div className="flex gap-2 pt-1">
              <Button type="button" size="sm" onClick={save} loading={busy}>
                Save Alignment
              </Button>
              <Button type="button" size="sm" variant="secondary" onClick={onClose} disabled={busy}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
