"use client";

import { useRef, useState, useCallback } from "react";
import { FloorFeature, FloorBooth, SizeStyle } from "./types";

const CELL_PX = 26;
const PAD = 2; // grid cells of padding around content

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
}: {
  features: FloorFeature[];
  booths: FloorBooth[];
  sizeStyles: Record<string, SizeStyle>;
  selectedBoothId?: string | null;
  onSelectBooth?: (booth: FloorBooth) => void;
  interactive?: boolean;
  allowAnyStatusClick?: boolean;
}) {
  const allX = [
    ...features.map((f) => f.gridX + f.gridW),
    ...booths.map((b) => b.gridX + b.gridW),
    10,
  ];
  const allY = [
    ...features.map((f) => f.gridY + f.gridH),
    ...booths.map((b) => b.gridY + b.gridH),
    10,
  ];
  const maxX = Math.max(...allX) + PAD;
  const maxY = Math.max(...allY) + PAD;

  const width = maxX * CELL_PX;
  const height = maxY * CELL_PX;

  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const dragState = useRef<{ x: number; y: number; startTranslate: { x: number; y: number } } | null>(null);
  const pinchState = useRef<{ dist: number; scale: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const clampScale = (s: number) => Math.min(3, Math.max(0.5, s));

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    dragState.current = { x: e.clientX, y: e.clientY, startTranslate: translate };
  }, [translate]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragState.current) return;
    const dx = e.clientX - dragState.current.x;
    const dy = e.clientY - dragState.current.y;
    setTranslate({ x: dragState.current.startTranslate.x + dx, y: dragState.current.startTranslate.y + dy });
  }, []);

  const onPointerUp = useCallback(() => {
    dragState.current = null;
  }, []);

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
        <span>{interactive ? "Drag to pan, scroll or pinch to zoom" : "Preview"}</span>
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
        ref={containerRef}
        className="relative w-full h-[420px] overflow-hidden touch-none cursor-grab active:cursor-grabbing bg-[repeating-linear-gradient(45deg,rgba(107,68,41,0.03),rgba(107,68,41,0.03)_10px,transparent_10px,transparent_20px)]"
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
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          style={{
            transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale})`,
            transformOrigin: "0 0",
          }}
        >
          <rect x={0} y={0} width={width} height={height} fill="none" stroke="#DDD3C3" strokeWidth={2} />

          {features.map((f) => (
            <g key={f.id}>
              <rect
                x={(f.gridX + PAD / 2) * CELL_PX}
                y={(f.gridY + PAD / 2) * CELL_PX}
                width={f.gridW * CELL_PX}
                height={f.gridH * CELL_PX}
                fill="#E3D9CC"
                stroke="#B79A7C"
                strokeDasharray={f.type.startsWith("ENTRANCE") ? "4 3" : undefined}
                rx={4}
              />
              <text
                x={(f.gridX + PAD / 2 + f.gridW / 2) * CELL_PX}
                y={(f.gridY + PAD / 2 + f.gridH / 2) * CELL_PX}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={10}
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
            const clickable = interactive && (allowAnyStatusClick || b.status === "AVAILABLE" || b.isMine);
            return (
              <g
                key={b.id}
                onClick={() => clickable && onSelectBooth?.(b)}
                style={{ cursor: clickable ? "pointer" : "default" }}
              >
                <rect
                  x={(b.gridX + PAD / 2) * CELL_PX}
                  y={(b.gridY + PAD / 2) * CELL_PX}
                  width={b.gridW * CELL_PX}
                  height={b.gridH * CELL_PX}
                  fill={fill}
                  opacity={b.status === "SOLD" ? 0.55 : 1}
                  stroke={isSelected || b.isMine ? "#2E7D32" : "#3A2417"}
                  strokeWidth={isSelected || b.isMine ? 3 : 1}
                  rx={3}
                />
                <text
                  x={(b.gridX + PAD / 2 + b.gridW / 2) * CELL_PX}
                  y={(b.gridY + PAD / 2 + b.gridH / 2) * CELL_PX}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={10}
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
