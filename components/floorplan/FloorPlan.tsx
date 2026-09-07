"use client";

import { useRef, useState, useCallback } from "react";
import { FloorFeature, FloorBooth, SizeStyle } from "./types";

// The floor plan canvas is always a 0-100 x 0-100 percentage space, whether
// or not there's a background image — booths/features store gridX/Y/W/H as
// percentages of this canvas. That keeps a single coordinate system for
// "click on the map to place a booth" regardless of whether admin is
// working over a real venue photo or the plain dotted background.
const VIEWBOX = 100;

const featureLabel: Record<string, string> = {
  ENTRANCE_MAIN: "Main entrance",
  ENTRANCE_SIDE: "Side entrance",
  TOILET_FEMALE: "Female toilets",
  TOILET_MALE: "Male toilets",
  OFFICE: "Office",
  LOADING: "Loading area",
  STAIRS: "Stairs to mezzanine",
  OTHER: "",
};

const statusFill: Record<string, string> = {
  AVAILABLE: "", // uses size color
  HELD: "#E9C46A",
  RESERVED: "#9CA3AF",
  SOLD: "#6B7280",
};

export function FloorPlan({
  features,
  booths,
  sizeStyles,
  selectedBoothId,
  onSelectBooth,
  interactive = true,
  allowAnyStatusClick = false,
  backgroundImageUrl,
  placementMode = false,
  onCanvasClick,
}: {
  features: FloorFeature[];
  booths: FloorBooth[];
  sizeStyles: Record<string, SizeStyle>;
  selectedBoothId?: string | null;
  onSelectBooth?: (booth: FloorBooth) => void;
  interactive?: boolean;
  allowAnyStatusClick?: boolean;
  /** URL of a real venue photo/drawing to place behind the plan. */
  backgroundImageUrl?: string | null;
  /** When true, clicking empty canvas calls onCanvasClick instead of panning. */
  placementMode?: boolean;
  onCanvasClick?: (xPercent: number, yPercent: number) => void;
}) {
  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const dragState = useRef<{ x: number; y: number; startTranslate: { x: number; y: number }; moved: boolean } | null>(null);
  const pinchState = useRef<{ dist: number; scale: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const clampScale = (s: number) => Math.min(4, Math.max(0.5, s));

  const pointToPercent = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const loc = pt.matrixTransform(ctm.inverse());
    return { x: Math.min(100, Math.max(0, loc.x)), y: Math.min(100, Math.max(0, loc.y)) };
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    dragState.current = { x: e.clientX, y: e.clientY, startTranslate: translate, moved: false };
  }, [translate]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragState.current) return;
    const dx = e.clientX - dragState.current.x;
    const dy = e.clientY - dragState.current.y;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragState.current.moved = true;
    setTranslate({ x: dragState.current.startTranslate.x + dx, y: dragState.current.startTranslate.y + dy });
  }, []);

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      const wasClick = dragState.current && !dragState.current.moved;
      dragState.current = null;
      if (wasClick && placementMode && onCanvasClick) {
        const pct = pointToPercent(e.clientX, e.clientY);
        if (pct) onCanvasClick(pct.x, pct.y);
      }
    },
    [placementMode, onCanvasClick, pointToPercent]
  );

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    setScale((s) => clampScale(s - e.deltaY * 0.0015));
  }, []);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const [a, b] = [e.touches[0], e.touches[1]];
      const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      pinchState.current = { dist, scale };
    }
  }, [scale]);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2 && pinchState.current) {
      const [a, b] = [e.touches[0], e.touches[1]];
      const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      const ratio = dist / pinchState.current.dist;
      setScale(clampScale(pinchState.current.scale * ratio));
    }
  }, []);

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    if (e.touches.length < 2) pinchState.current = null;
  }, []);

  return (
    <div className="rounded-xl border border-brown/15 bg-cream-soft overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-brown/10 text-xs text-brown-light">
        <span>
          {placementMode
            ? "Click the map to place a booth"
            : interactive
            ? "Drag to pan, scroll or pinch to zoom"
            : "Preview"}
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setScale((s) => clampScale(s - 0.2))}
            className="w-7 h-7 rounded-full border border-brown/30 hover:bg-brown/10"
          >
            −
          </button>
          <button
            type="button"
            onClick={() => {
              setScale(1);
              setTranslate({ x: 0, y: 0 });
            }}
            className="w-7 h-7 rounded-full border border-brown/30 hover:bg-brown/10 text-[10px]"
          >
            ⤾
          </button>
          <button
            type="button"
            onClick={() => setScale((s) => clampScale(s + 0.2))}
            className="w-7 h-7 rounded-full border border-brown/30 hover:bg-brown/10"
          >
            +
          </button>
        </div>
      </div>

      <div
        className={`relative w-full h-[460px] overflow-hidden touch-none ${
          placementMode ? "cursor-crosshair" : "cursor-grab active:cursor-grabbing"
        } ${!backgroundImageUrl ? "bg-[repeating-linear-gradient(45deg,rgba(107,68,41,0.03),rgba(107,68,41,0.03)_10px,transparent_10px,transparent_20px)]" : ""}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        onWheel={onWheel}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <svg
          ref={svgRef}
          width="100%"
          height="100%"
          viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`}
          preserveAspectRatio="none"
          style={{
            transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale})`,
            transformOrigin: "0 0",
          }}
        >
          <rect x={0} y={0} width={VIEWBOX} height={VIEWBOX} fill="transparent" stroke="#DDD3C3" strokeWidth={0.3} />

          {backgroundImageUrl && (
            <image href={backgroundImageUrl} x={0} y={0} width={VIEWBOX} height={VIEWBOX} preserveAspectRatio="none" />
          )}

          {features.map((f) => (
            <g key={f.id}>
              <rect
                x={f.gridX}
                y={f.gridY}
                width={f.gridW}
                height={f.gridH}
                fill={backgroundImageUrl ? "rgba(227,217,204,0.75)" : "#E3D9CC"}
                stroke="#B79A7C"
                strokeWidth={0.15}
                strokeDasharray={f.type.startsWith("ENTRANCE") ? "1 0.7" : undefined}
              />
              <text
                x={f.gridX + f.gridW / 2}
                y={f.gridY + f.gridH / 2}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={2.2}
                fill="#6B4429"
              >
                {f.label || featureLabel[f.type]}
              </text>
            </g>
          ))}

          {booths.map((b) => {
            const style = sizeStyles[b.size] || { color: "#B58A63", label: b.size };
            const isSelected = selectedBoothId === b.id;
            const fill = b.status === "AVAILABLE" ? style.color : statusFill[b.status] || style.color;
            const clickable = interactive && !placementMode && (allowAnyStatusClick || b.status === "AVAILABLE" || b.isMine);
            return (
              <g
                key={b.id}
                onClick={(e) => {
                  if (!clickable) return;
                  e.stopPropagation();
                  onSelectBooth?.(b);
                }}
                style={{ cursor: clickable ? "pointer" : "default" }}
              >
                <rect
                  x={b.gridX}
                  y={b.gridY}
                  width={b.gridW}
                  height={b.gridH}
                  fill={fill}
                  opacity={b.status === "SOLD" ? 0.6 : backgroundImageUrl ? 0.85 : 1}
                  stroke={isSelected || b.isMine ? "#2E7D32" : "#3A2417"}
                  strokeWidth={isSelected || b.isMine ? 0.6 : 0.15}
                />
                <text
                  x={b.gridX + b.gridW / 2}
                  y={b.gridY + b.gridH / 2}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={2.4}
                  fontWeight={600}
                  fill="#FBF8F3"
                >
                  {b.code}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
