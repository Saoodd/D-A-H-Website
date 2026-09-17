"use client";

import { useMemo, useState } from "react";

interface Row {
  entityId: string;
  code: string;
  gridX: number;
  gridY: number;
  gridW: number;
  gridH: number;
  rotation: number;
  widthMm: number;
  depthMm: number;
  xMm: number;
  yMm: number;
}

/** JSON → interactive DAH booths, end to end: paste/upload a "DAH Floor
 *  Plan JSON" file (see lib/floorplanImport.ts for the documented, versioned
 *  format) → server-side validation → this Import Preview (nothing written
 *  yet) → explicit commit through the EXACT SAME endpoint CAD import uses
 *  (.../cad-import/commit), reusing its newOnly/matchUpdate/replace modes
 *  and venue-boundary check rather than a second commit implementation.
 *  Requires the event's physical scale to already be confirmed — this
 *  format is always real mm, with no legacy-percentage fallback. */
export function JsonImportPanel({
  eventId,
  existingCodes,
  onImported,
}: {
  eventId: string;
  existingCodes: string[];
  onImported: () => void;
}) {
  const [text, setText] = useState("");
  const [parsing, setParsing] = useState(false);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [mode, setMode] = useState<"matchUpdate" | "newOnly" | "replace">("matchUpdate");
  const [boundaryOverride, setBoundaryOverride] = useState(false);
  const [importing, setImporting] = useState(false);

  const existingCodeSet = useMemo(() => new Set(existingCodes), [existingCodes]);
  const collisions = (rows ?? []).filter((r) => existingCodeSet.has(r.code));

  async function runParse() {
    if (!text.trim()) {
      setError("Paste or upload a DAH Floor Plan JSON file first.");
      return;
    }
    setParsing(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/events/${eventId}/floorplan/json-import/parse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Couldn't validate that file.");
        setRows(null);
        return;
      }
      setRows(data.rows as Row[]);
      setWarnings(data.warnings ?? []);
    } finally {
      setParsing(false);
    }
  }

  async function submitImport() {
    if (!rows || rows.length === 0) return;
    setImporting(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/events/${eventId}/floorplan/cad-import/commit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          boundaryOverride,
          rows: rows.map((r) => ({
            code: r.code,
            gridX: r.gridX,
            gridY: r.gridY,
            gridW: r.gridW,
            gridH: r.gridH,
            rotation: r.rotation,
            widthMm: r.widthMm,
            depthMm: r.depthMm,
            xMm: r.xMm,
            yMm: r.yMm,
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
      setRows(null);
      setWarnings([]);
      setText("");
      onImported();
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-brown-light">
        For a floor plan already available as structured data (not a CAD drawing) — a versioned, mm-based JSON format. Requires this event&apos;s physical scale to be confirmed first.
      </p>

      {!rows && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <label className="px-3 py-1.5 rounded-[6px] border border-brown/25 text-xs cursor-pointer hover:bg-brown hover:text-cream-soft transition-colors">
              Choose JSON file
              <input
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) setText(await file.text());
                  setError(null);
                }}
              />
            </label>
            <span className="text-xs text-brown-light">or paste below</span>
          </div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={'{\n  "version": 1,\n  "booths": [\n    { "code": "B1", "widthMm": 3000, "depthMm": 2000, "xMm": 1000, "yMm": 1000 }\n  ]\n}'}
            rows={6}
            className="w-full border border-brown/20 rounded-[6px] px-3 py-2 bg-cream-soft text-xs font-mono"
          />
          <button type="button" onClick={runParse} disabled={parsing} className="px-4 py-2 rounded-[6px] bg-brown text-cream-soft text-sm disabled:opacity-50">
            {parsing ? "Validating…" : "Validate & Preview"}
          </button>
        </div>
      )}

      {error && <p className="text-sm text-red-700">{error}</p>}
      {notice && <p className="text-sm text-emerald-700">{notice}</p>}

      {rows && (
        <div className="space-y-4">
          <div className="rounded-[8px] border border-brown/10 bg-cream p-3 text-sm">
            <p className="font-medium text-brown-dark mb-1">JSON Import Preview</p>
            <p className="text-xs text-brown-light">{rows.length} booth{rows.length === 1 ? "" : "s"} validated.</p>
            {warnings.length > 0 && (
              <ul className="mt-1.5 text-xs text-amber-800 list-disc list-inside">
                {warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            )}
          </div>

          <div className="max-h-72 overflow-y-auto space-y-1.5">
            {rows.map((r) => (
              <div key={r.entityId} className="flex items-center gap-2 rounded-[6px] border border-brown/15 bg-white px-2.5 py-1.5 text-xs">
                <span className="w-16 font-medium text-brown-dark">{r.code}</span>
                <span className="text-brown-light">{(r.widthMm / 1000).toFixed(1)}m × {(r.depthMm / 1000).toFixed(1)}m</span>
                <span className="text-brown-light ml-auto">@ {(r.xMm / 1000).toFixed(1)}m, {(r.yMm / 1000).toFixed(1)}m</span>
                {r.rotation ? <span className="text-brown-light">{r.rotation}°</span> : null}
                {existingCodeSet.has(r.code) && <span className="text-blue-700">existing</span>}
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

          <label className="flex items-center gap-1.5 text-xs text-brown-light">
            <input type="checkbox" checked={boundaryOverride} onChange={(e) => setBoundaryOverride(e.target.checked)} />
            Allow booths outside the venue boundary (skips the safety check — not recommended)
          </label>

          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={submitImport} disabled={importing} className="px-4 py-2 rounded-[6px] bg-brown text-cream-soft text-sm disabled:opacity-50">
              {importing ? "Importing…" : `Import ${rows.length} Booth${rows.length === 1 ? "" : "s"}`}
            </button>
            <button
              type="button"
              onClick={() => {
                setRows(null);
                setWarnings([]);
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
