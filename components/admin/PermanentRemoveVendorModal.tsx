"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";

const CONFIRM_WORD = "DELETE";

// Admin-only, irreversible vendor removal. Deliberately harder to trigger
// than the vendor's own self-close flow: typing the literal word "DELETE"
// is the only thing that enables the button, and the server re-checks the
// same word independently (see /api/admin/vendors/[id] DELETE) — this
// modal is a UX gate, never the real guarantee.
export function PermanentRemoveVendorModal({ vendorId, businessName }: { vendorId: string; businessName: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/vendors/${vendorId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation: CONFIRM_WORD }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not remove this vendor.");
      router.push("/admin/vendors");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove this vendor.");
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <Button variant="destructive" size="sm" onClick={() => setOpen(true)}>
        Permanently Remove Vendor
      </Button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-[10px] bg-cream-soft border border-brown/10 p-6 shadow-xl">
        <p className="font-heading text-lg text-brown-dark mb-1">Remove {businessName}?</p>
        <p className="text-sm text-brown-light mb-4">
          Permanently remove this vendor? This will remove the vendor account, business profile and removable personal data from
          DAH. This action cannot be undone.
        </p>

        <label className="flex flex-col gap-1 text-sm mb-4">
          Type <span className="font-mono font-semibold">{CONFIRM_WORD}</span> to confirm
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            className="border border-brown/20 rounded-lg px-3 py-2 bg-cream text-sm font-mono"
          />
        </label>

        {error && <p className="text-sm text-red-700 dark:text-red-400 mb-4">{error}</p>}

        <div className="flex gap-3 justify-end">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => {
              setOpen(false);
              setTyped("");
              setError(null);
            }}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={handleConfirm}
            disabled={typed !== CONFIRM_WORD}
            loading={busy}
          >
            Permanently Remove Vendor
          </Button>
        </div>
      </div>
    </div>
  );
}
