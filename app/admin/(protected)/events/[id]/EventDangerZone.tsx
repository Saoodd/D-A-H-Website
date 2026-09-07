"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function EventDangerZone({ eventId, eventName }: { eventId: string; eventName: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handleDelete() {
    if (!confirm(`Delete "${eventName}"? This removes its floor plan, booths and applications. This cannot be undone.`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/events/${eventId}`, { method: "DELETE" });
      if (res.ok) {
        router.push("/admin/events");
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-12 border border-red-200 rounded-xl p-5">
      <p className="text-sm text-red-800 mb-3">Danger zone</p>
      <button onClick={handleDelete} disabled={busy} className="text-sm px-4 py-2 rounded-full bg-red-700 text-white disabled:opacity-50">
        Delete this event
      </button>
    </div>
  );
}
