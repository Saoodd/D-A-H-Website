"use client";

import { useMemo, useState } from "react";

interface DetectedBooth {
  entityId: string;
  code: string | null;
  labelConfidence: "matched" | "unlabeled";
  gridX: number;
  gridY: number;
  gridW: number;
  gridH: number;
  rotation: number;
  widthMm: number | null;
  depthMm: number | null;
  layer: string;
  source: "polyline" | "insert";
}

interface CadArchitectureLine {
  layer: string;
  points: { x: number; y: number }[];
}

interface ParseResult {
  unitsLabel: string;
  unitToMm: number;
  layers: string[];
  boothLayerGuess: string[];
  usedBoothLayers: string[] | null;
  detected: DetectedBooth[];
  unlabeledCount: number;
  architecture: CadArchitectureLine[];
  warnings: string[];
}

interface Row extends Omit<DetectedBooth, "code"> {
  code: string; // never null in row state — always defaulted to a placeholder on load, see runParse
  include: boolean;
}

/** CAD → interactive DAH booths, end to end: upload a DXF → server-side
 *  detection (see lib/cadImport.ts) → this Import Preview (nothing is
 *  written to the database yet) → explicit commit, which turns reviewed
 *  rows into real Booth records via the exact same model every other booth
 *  uses. Reused from FloorPlanBuilder's Advanced panel. */
export function CadImportPanel({
  eventId,
  existingCodes,
  onImported,
}: {
  eventId: string;
  existingCodes: string[];
  onImported: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [selectedLayers, setSelectedLayers] = useState<string[]>([]);
  const [parsing, setParsing] = useState(false);
  const [result, setResult] = useState<ParseResult | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [mode, setMode] = useState<"matchUpdate" | "newOnly" | "replace">("matchUpdate");
  const [importing, setImporting] = useState(false);

  const existingCodeSet = useMemo(() => new Set(existingCodes), [existingCodes]);
  const includedRows = rows.filter((r) => r.include);
  const collisions = includedRows.filter((r) => r.code && existingCodeSet.has(r.code));

  async function runParse(layers: string[]) {
    if (!file) return;
    setParsing(true);
    setError(null);
    setNotice(null);
    try {
      const form = new FormData();
      form.append("file", file);
      if (layers.length > 0) form.append("boothLayers", layers.join(","));
      const res = await fetch(`/api/admin/events/${eventId}/floorplan/cad-import/parse`, { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Couldn't parse that file.");
        setResult(null);
        setRows([]);
        return;
      }
      setResult(data as ParseResult);
      setRows(
        (data.detected as DetectedBooth[]).map((d, i) => ({
          ...d,
          code: d.code ?? `?${i + 1}`,
          include: d.labelConfidence === "matched",
        }))
      );
    } finally {
      setParsing(false);
    }
  }

  function toggleLayer(layer: string) {
    setSelectedLayers((prev) => (prev.includes(layer) ? prev.filter((l) => l !== layer) : [...prev, layer]));
  }

  function updateRow(entityId: string, patch: Partial<Row>) {
    setRows((prev) => prev.map((r) => (r.entityId === entityId ? { ...r, ...patch } : r)));
  }

  async function submitImport() {
    const toImport = includedRows;
    if (toImport.length === 0) {
      setError("Select at least one detected booth to import.");
      return;
    }
    if (toImport.some((r) => !r.code.trim() || r.code.startsWith("?"))) {
      setError("Every booth being imported needs a real code — correct the unlabeled rows first.");
      return;
    }
    setImporting(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/events/${eventId}/floorplan/cad-import/commit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          rows: toImport.map((r) => ({
            code: r.code.trim(),
            gridX: r.gridX,
            gridY: r.gridY,
            gridW: r.gridW,
            gridH: r.gridH,
            rotation: r.rotation,
            widthMm: r.widthMm,
            depthMm: r.depthMm,
          })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Import failed.");
        return;
      }
      let msg = `Created ${data.created}, updated ${data.updated}.`;
      if (data.skipped > 0) msg += ` ${data.skipped} skipped: ${data.skippedDetails.map((s: { code: string; reason: string }) => `${s.code} (${s.reason})`).join(", ")}.`;
      if (data.deleted > 0) msg += ` ${data.deleted} removed (not in the new layout).`;
      if (data.deleteSkipped > 0) msg += ` ${data.deleteSkipped} kept despite not being in the new layout: ${data.deleteSkippedDetails.map((s: { code: string; reason: string }) => `${s.code} (${s.reason})`).join(", ")}.`;
      setNotice(msg);
      setResult(null);
      setRows([]);
      setFile(null);
      onImported();
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="space-y-4">
      {!result && (
        <div className="flex flex-wrap items-center gap-3">
          <label className="px-3 py-1.5 rounded-[6px] border border-brown/25 text-xs cursor-pointer hover:bg-brown hover:text-cream-soft transition-colors">
            {file ? file.name : "Choose DXF file"}
            <input
              type="file"
              accept=".dxf"
              className="hidden"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setSelectedLayers([]);
                setError(null);
              }}
            />
          </label>
          <button
            type="button"
            onClick={() => runParse(selectedLayers)}
            disabled={!file || parsing}
            className="px-4 py-2 rounded-[6px] bg-brown text-cream-soft text-sm disabled:opacity-50"
          >
            {parsing ? "Analyzing…" : "Analyze File"}
          </button>
          <span className="text-xs text-brown-light">DXF only — export DWG to DXF first if needed.</span>
        </div>
      )}

      {error && <p className="text-sm text-red-700">{error}</p>}
      {notice && <p className="text-sm text-emerald-700">{notice}</p>}

      {result && (
        <div className="space-y-4">
          {/* Ambiguous-layer picker: shown only when auto-detection found no
              obvious BOOTHS/STALLS/KIOSKS-style layer name to key off. */}
          {result.boothLayerGuess.length === 0 && result.layers.length > 1 && !result.usedBoothLayers && (
            <div className="rounded-[8px] border border-amber-300/60 bg-amber-50 p-3">
              <p className="text-xs text-amber-900 mb-2">Which layer(s) contain the booth shapes? Detection was uncertain — choose one or more, then re-analyze.</p>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {result.layers.map((l) => (
                  <button
                    key={l}
                    type="button"
                    onClick={() => toggleLayer(l)}
                    className={`text-xs px-2.5 py-1 rounded-full border ${selectedLayers.includes(l) ? "bg-brown text-cream-soft border-brown" : "border-brown/25 text-brown-dark"}`}
                  >
                    {l}
                  </button>
                ))}
              </div>
              <button type="button" onClick={() => runParse(selectedLayers)} disabled={selectedLayers.length === 0 || parsing} className="text-xs px-3 py-1.5 rounded-[6px] bg-brown text-cream-soft disabled:opacity-50">
                Re-analyze with selected layer(s)
              </button>
            </div>
          )}

          <div className="rounded-[8px] border border-brown/10 bg-cream p-3 text-sm">
            <p className="font-medium text-brown-dark mb-1">CAD Import Preview</p>
            <p className="text-xs text-brown-light">
              Detected booth objects: {result.detected.length} · Labels detected: {result.detected.length - result.unlabeledCount} · Unlabeled: {result.unlabeledCount} · CAD unit: {result.unitsLabel}
            </p>
            {result.warnings.length > 0 && (
              <ul className="mt-1.5 text-xs text-amber-800 list-disc list-inside">
                {result.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            )}
          </div>

          <CadPreviewCanvas rows={rows} architecture={result.architecture} />

          <div className="max-h-72 overflow-y-auto space-y-1.5">
            {rows.map((r) => (
              <div
                key={r.entityId}
                className={`flex items-center gap-2 rounded-[6px] border px-2.5 py-1.5 text-xs ${
                  !r.include ? "border-brown/10 bg-cream-soft opacity-50" : r.labelConfidence === "unlabeled" ? "border-amber-300 bg-amber-50" : "border-brown/15 bg-white"
                }`}
              >
                <input type="checkbox" checked={r.include} onChange={(e) => updateRow(r.entityId, { include: e.target.checked })} />
                <input
                  value={r.code ?? ""}
                  onChange={(e) => updateRow(r.entityId, { code: e.target.value, labelConfidence: "matched" })}
                  className="w-20 border border-brown/20 rounded px-1.5 py-1 bg-cream-soft"
                />
                <span className="text-brown-light">{r.layer}</span>
                <input
                  type="number"
                  step="0.1"
                  value={r.widthMm != null ? r.widthMm / 1000 : ""}
                  onChange={(e) => updateRow(r.entityId, { widthMm: e.target.value ? Math.round(Number(e.target.value) * 1000) : null })}
                  className="w-16 border border-brown/20 rounded px-1.5 py-1 bg-cream-soft"
                  placeholder="W m"
                />
                <span className="text-brown-light">×</span>
                <input
                  type="number"
                  step="0.1"
                  value={r.depthMm != null ? r.depthMm / 1000 : ""}
                  onChange={(e) => updateRow(r.entityId, { depthMm: e.target.value ? Math.round(Number(e.target.value) * 1000) : null })}
                  className="w-16 border border-brown/20 rounded px-1.5 py-1 bg-cream-soft"
                  placeholder="D m"
                />
                <span className="text-brown-light">m</span>
                {r.labelConfidence === "unlabeled" && <span className="text-amber-800 ml-auto">no label found nearby</span>}
              </div>
            ))}
          </div>

          {collisions.length > 0 && (
            <div className="rounded-[8px] border border-blue-300 bg-blue-50 p-3 text-xs text-blue-900 space-y-2">
              <p>{collisions.length} of these codes already exist in this event: {collisions.map((c) => c.code).join(", ")}.</p>
              <div className="flex flex-col gap-1.5">
                <label className="flex items-center gap-1.5">
                  <input type="radio" checked={mode === "matchUpdate"} onChange={() => setMode("matchUpdate")} />
                  Match/update existing booths by code (confirmed/sold booths are always left untouched)
                </label>
                <label className="flex items-center gap-1.5">
                  <input type="radio" checked={mode === "newOnly"} onChange={() => setMode("newOnly")} />
                  Import new booths only — skip anything that already exists
                </label>
                <label className="flex items-center gap-1.5">
                  <input type="radio" checked={mode === "replace"} onChange={() => setMode("replace")} />
                  Replace layout — also removes booths not in this import (never a confirmed booking or payment history)
                </label>
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={submitImport}
              disabled={importing || includedRows.length === 0}
              className="px-4 py-2 rounded-[6px] bg-brown text-cream-soft text-sm disabled:opacity-50"
            >
              {importing ? "Importing…" : `Import ${includedRows.length} Booth${includedRows.length === 1 ? "" : "s"}`}
            </button>
            <button
              type="button"
              onClick={() => {
                setResult(null);
                setRows([]);
                setFile(null);
                setError(null);
              }}
              disabled={importing}
              className="px-4 py-2 rounded-[6px] border border-brown/25 text-sm text-brown-dark disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** A lightweight, read-only SVG preview of the drawing — background
 *  architecture (walls/aisles etc.) in a muted line, each detected booth
 *  as a rotated rect, colored by inclusion/label state. Deliberately a
 *  plain SVG rather than the full FloorPlan component: this is a
 *  before-import preview of candidate geometry, not an interactive booth
 *  map, and FloorPlan has no concept of background architecture lines. */
function CadPreviewCanvas({ rows, architecture }: { rows: Row[]; architecture: CadArchitectureLine[] }) {
  return (
    <div className="rounded-[8px] border border-brown/10 bg-cream-soft aspect-square w-full max-w-md mx-auto overflow-hidden">
      <svg viewBox="0 0 100 100" className="w-full h-full">
        {architecture.map((a, i) => (
          <polyline key={i} points={a.points.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke="#8A5A38" strokeWidth={0.3} opacity={0.35} />
        ))}
        {rows.map((r) => {
          const cx = r.gridX + r.gridW / 2;
          const cy = r.gridY + r.gridH / 2;
          const color = !r.include ? "#8A5A3855" : r.labelConfidence === "unlabeled" ? "#D97706" : "#2E7D32";
          return (
            <g key={r.entityId} transform={`rotate(${r.rotation} ${cx} ${cy})`}>
              <rect x={r.gridX} y={r.gridY} width={r.gridW} height={r.gridH} fill={color} fillOpacity={0.25} stroke={color} strokeWidth={0.4} />
              <text x={cx} y={cy} fontSize={2.5} textAnchor="middle" dominantBaseline="middle" fill={color}>
                {r.code}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
