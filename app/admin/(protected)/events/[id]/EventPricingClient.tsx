"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { filsToAed } from "@/lib/constants";

interface TierRow {
  sizeKey: string;
  label: string;
  globalPriceAedFils: number;
  overridePriceAedFils: number | null;
}

interface RowState {
  sizeKey: string;
  label: string;
  globalPriceAedFils: number;
  enabled: boolean;
  valueAed: number; // AED, not fils — this is what the input edits
}

export function EventPricingClient({ eventId, tiers: initial }: { eventId: string; tiers: TierRow[] }) {
  const router = useRouter();
  const [rows, setRows] = useState<RowState[]>(
    initial.map((t) => ({
      sizeKey: t.sizeKey,
      label: t.label,
      globalPriceAedFils: t.globalPriceAedFils,
      enabled: t.overridePriceAedFils != null,
      valueAed: filsToAed(t.overridePriceAedFils ?? t.globalPriceAedFils),
    }))
  );
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      await fetch(`/api/admin/events/${eventId}/pricing`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          overrides: rows.map((r) => ({
            sizeKey: r.sizeKey,
            priceAedFils: r.enabled ? Math.round(r.valueAed * 100) : null,
          })),
        }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-brown/10 bg-cream p-5">
      <p className="text-sm text-brown-light mb-4">
        Charge a different price at this event without changing the site-wide default (Admin → Pricing). Only
        applies to booths that don&apos;t have their own price set directly in the floor plan below.
      </p>
      <div className="space-y-3">
        {rows.map((r, i) => (
          <div key={r.sizeKey} className="flex flex-wrap items-center gap-3 text-sm">
            <label className="flex items-center gap-2 w-40">
              <input
                type="checkbox"
                checked={r.enabled}
                onChange={(e) =>
                  setRows((prev) => prev.map((row, idx) => (idx === i ? { ...row, enabled: e.target.checked } : row)))
                }
              />
              {r.sizeKey} — {r.label}
            </label>
            <span className="text-xs text-brown-light">Default: {filsToAed(r.globalPriceAedFils)} AED</span>
            <input
              type="number"
              step="0.01"
              disabled={!r.enabled}
              value={r.valueAed}
              onChange={(e) =>
                setRows((prev) =>
                  prev.map((row, idx) => (idx === i ? { ...row, valueAed: Number(e.target.value) } : row))
                )
              }
              className="border border-brown/20 rounded-lg px-2 py-1.5 bg-cream-soft w-28 disabled:opacity-40"
            />
            <span className="text-xs text-brown-light">AED for this event</span>
          </div>
        ))}
      </div>
      <button onClick={save} disabled={busy} className="mt-4 px-5 py-2 rounded-full bg-brown text-cream-soft text-sm disabled:opacity-50">
        Save event pricing
      </button>
    </div>
  );
}
