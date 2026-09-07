"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { filsToAed } from "@/lib/constants";

interface Tier {
  sizeKey: string;
  label: string;
  priceAedFils: number;
  vatInclusive: boolean;
  active: boolean;
}

export function PricingClient({ tiers: initial }: { tiers: Tier[] }) {
  const router = useRouter();
  const [tiers, setTiers] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [newTier, setNewTier] = useState({ sizeKey: "", label: "", priceAedFils: "" });

  function update(i: number, patch: Partial<Tier>) {
    setTiers((prev) => prev.map((t, idx) => (idx === i ? { ...t, ...patch } : t)));
  }

  async function save() {
    setBusy(true);
    try {
      await fetch("/api/admin/pricing", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tiers }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function addTier() {
    if (!newTier.sizeKey || !newTier.label || !newTier.priceAedFils) return;
    await fetch("/api/admin/pricing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sizeKey: newTier.sizeKey,
        label: newTier.label,
        priceAedFils: Math.round(Number(newTier.priceAedFils) * 100),
      }),
    });
    setNewTier({ sizeKey: "", label: "", priceAedFils: "" });
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {tiers.map((t, i) => (
        <div key={t.sizeKey} className="grid sm:grid-cols-5 gap-3 items-end bg-cream rounded-xl border border-brown/10 p-4">
          <label className="flex flex-col gap-1 text-xs text-brown-light">
            Size key
            <input value={t.sizeKey} disabled className="border border-brown/20 rounded-lg px-2 py-1.5 bg-cream-deep text-sm" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-brown-light sm:col-span-2">
            Label
            <input value={t.label} onChange={(e) => update(i, { label: e.target.value })} className="border border-brown/20 rounded-lg px-2 py-1.5 bg-cream-soft text-sm" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-brown-light">
            Price (AED, VAT incl.)
            <input
              type="number"
              step="0.01"
              value={filsToAed(t.priceAedFils)}
              onChange={(e) => update(i, { priceAedFils: Math.round(Number(e.target.value) * 100) })}
              className="border border-brown/20 rounded-lg px-2 py-1.5 bg-cream-soft text-sm"
            />
          </label>
          <label className="flex items-center gap-2 text-xs text-brown-light">
            <input type="checkbox" checked={t.active} onChange={(e) => update(i, { active: e.target.checked })} />
            Active
          </label>
        </div>
      ))}

      <button onClick={save} disabled={busy} className="px-6 py-2.5 rounded-full bg-brown text-cream-soft text-sm disabled:opacity-50">
        Save pricing
      </button>

      <div className="mt-8 rounded-xl border border-dashed border-brown/30 p-4">
        <p className="text-sm font-medium text-brown-dark mb-3">Add a new size tier</p>
        <div className="grid sm:grid-cols-4 gap-2">
          <input placeholder="Size key e.g. 4x2" value={newTier.sizeKey} onChange={(e) => setNewTier((n) => ({ ...n, sizeKey: e.target.value }))} className="border border-brown/20 rounded-lg px-2 py-1.5 bg-cream-soft text-sm" />
          <input placeholder="Label" value={newTier.label} onChange={(e) => setNewTier((n) => ({ ...n, label: e.target.value }))} className="border border-brown/20 rounded-lg px-2 py-1.5 bg-cream-soft text-sm" />
          <input placeholder="Price AED" type="number" step="0.01" value={newTier.priceAedFils} onChange={(e) => setNewTier((n) => ({ ...n, priceAedFils: e.target.value }))} className="border border-brown/20 rounded-lg px-2 py-1.5 bg-cream-soft text-sm" />
          <button onClick={addTier} className="px-4 py-1.5 rounded-full border border-brown/30 text-sm">
            Add tier
          </button>
        </div>
      </div>
    </div>
  );
}
