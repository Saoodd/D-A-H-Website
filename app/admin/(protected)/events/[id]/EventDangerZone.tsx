"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";

const CANCEL_CONFIRM_WORD = "CANCEL";

export function EventDangerZone({ eventId, eventName, eventStatus }: { eventId: string; eventName: string; eventStatus: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [cancelResult, setCancelResult] = useState<{ affectedCount: number; notifiedCount: number } | null>(null);

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

  async function handleCancelConfirm() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/events/${eventId}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation: CANCEL_CONFIRM_WORD }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not cancel this event.");
      setCancelResult({ affectedCount: data.affectedCount, notifiedCount: data.notifiedCount });
      setCancelOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not cancel this event.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-12 border border-red-200 rounded-[10px] p-5 space-y-4">
      <p className="text-sm text-red-800">Danger zone</p>
      {error && <p className="text-sm text-red-700">{error}</p>}
      {cancelResult && (
        <p className="text-sm text-brown-dark bg-cream-deep/30 rounded-[6px] px-3 py-2">
          Event cancelled. {cancelResult.affectedCount} affected vendor{cancelResult.affectedCount === 1 ? "" : "s"},{" "}
          {cancelResult.notifiedCount} notified via WhatsApp.
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        {eventStatus !== "CANCELLED" && (
          <Button variant="destructive" onClick={() => setCancelOpen(true)} disabled={busy}>
            Cancel this event
          </Button>
        )}
        <Button variant="destructive" onClick={handleDelete} loading={busy}>
          Delete this event
        </Button>
      </div>

      {cancelOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-[10px] bg-cream-soft border border-brown/10 p-6 shadow-xl">
            <p className="font-heading text-lg text-brown-dark mb-1">Cancel {eventName}?</p>
            <p className="text-sm text-brown-light mb-4">
              This marks the event CANCELLED and sends an EVENT_CANCELLED WhatsApp notification to every vendor with a still-live
              (pending or accepted) application for it — rejected and expired applicants are not contacted. This cannot be undone
              from here.
            </p>
            <label className="flex flex-col gap-1 text-sm mb-4">
              Type <span className="font-mono font-semibold">{CANCEL_CONFIRM_WORD}</span> to confirm
              <input
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                autoComplete="off"
                spellCheck={false}
                className="border border-brown/20 rounded-lg px-3 py-2 bg-cream text-sm font-mono"
              />
            </label>
            <div className="flex gap-3 justify-end">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => {
                  setCancelOpen(false);
                  setTyped("");
                }}
                disabled={busy}
              >
                Back
              </Button>
              <Button type="button" variant="destructive" size="sm" onClick={handleCancelConfirm} disabled={typed !== CANCEL_CONFIRM_WORD} loading={busy}>
                Cancel Event
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
