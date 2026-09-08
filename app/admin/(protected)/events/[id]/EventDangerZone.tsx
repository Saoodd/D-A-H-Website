"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";

export function EventDangerZone({ eventId, eventName }: { eventId: string; eventName: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    if (!confirm(`Delete "${eventName}"? This removes its floor plan, booths and applications. This cannot be undone.`)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/events/${eventId}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not delete this event.");
      router.push("/admin/events");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete this event.");
      setBusy(false);
    }
  }

  return (
    <div className="mt-12 border border-red-200 rounded-[10px] p-5">
      <p className="text-sm text-red-800 mb-3">Danger zone</p>
      {error && <p className="text-sm text-red-700 mb-3">{error}</p>}
      <Button variant="destructive" onClick={handleDelete} loading={busy}>
        Delete this event
      </Button>
    </div>
  );
}
