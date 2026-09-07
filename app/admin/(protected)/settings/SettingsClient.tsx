"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function SettingsClient({
  mainCommunityWhatsappLink,
  defaultAcceptanceDeadlineHours,
}: {
  mainCommunityWhatsappLink: string | null;
  defaultAcceptanceDeadlineHours: number;
}) {
  const router = useRouter();
  const [link, setLink] = useState(mainCommunityWhatsappLink || "");
  const [hours, setHours] = useState(String(defaultAcceptanceDeadlineHours));
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save() {
    setBusy(true);
    setSaved(false);
    try {
      await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mainCommunityWhatsappLink: link, defaultAcceptanceDeadlineHours: Number(hours) }),
      });
      setSaved(true);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6 bg-cream rounded-2xl border border-brown/10 p-6">
      <label className="flex flex-col gap-1 text-sm">
        Main DAH Community Group (WhatsApp link)
        <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://chat.whatsapp.com/…" className="border border-brown/20 rounded-lg px-3 py-2 bg-cream-soft" />
        <span className="text-xs text-brown-light">
          Site-wide — visible to every registered vendor regardless of application status.
        </span>
      </label>

      <label className="flex flex-col gap-1 text-sm">
        Default acceptance/payment deadline (hours)
        <input type="number" value={hours} onChange={(e) => setHours(e.target.value)} className="border border-brown/20 rounded-lg px-3 py-2 bg-cream-soft w-40" />
        <span className="text-xs text-brown-light">
          Applies to future approvals unless overridden per-event or at the moment of approval.
        </span>
      </label>

      {saved && <p className="text-sm text-green-700">Saved.</p>}

      <button onClick={save} disabled={busy} className="px-6 py-2.5 rounded-full bg-brown text-cream-soft text-sm disabled:opacity-50">
        Save settings
      </button>
    </div>
  );
}
