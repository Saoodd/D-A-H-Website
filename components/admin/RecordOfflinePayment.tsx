"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { formatAed, formatBoothCodes } from "@/lib/constants";
import { OFFLINE_PAYMENT_METHODS, paymentMethodLabel, type OfflinePaymentMethod } from "@/lib/paymentLabels";
import type { OfflinePaymentQuote } from "@/lib/offlinePayment";

/** Admin form that records a payment DAH collected outside the website and
 *  confirms the vendor's reserved booth(s). The amount is fixed by the
 *  server's quote; the admin confirms it rather than typing it. */
export function RecordOfflinePayment({
  applicationId,
  quote,
  onlineMode,
}: {
  applicationId: string;
  quote: OfflinePaymentQuote;
  onlineMode: "LIVE" | "SANDBOX" | "DISABLED";
}) {
  const router = useRouter();
  const [method, setMethod] = useState<OfflinePaymentMethod>("BANK_TRANSFER");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function submit() {
    if (!quote.ok) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/applications/${applicationId}/offline-payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          method,
          reference: reference.trim(),
          note: note.trim() || undefined,
          expectedAmountAedFils: quote.totalAedFils,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not record the payment");
      setDone(data.receiptNumber);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not record the payment");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="mt-8 rounded-xl border border-brown/15 bg-cream p-5">
      <p className="text-xs uppercase tracking-widest text-brown-light mb-1">Record offline payment</p>
      <p className="text-sm text-brown-light mb-4">
        {onlineMode === "DISABLED"
          ? "Online payment is switched off on this site, so bookings are confirmed here once DAH has received the money."
          : "Use this when the vendor paid DAH directly instead of online."}
      </p>

      {done ? (
        <p className="text-sm text-green-800" role="status">
          Payment recorded. Receipt {done} has been issued and the vendor notified.
        </p>
      ) : !quote.ok ? (
        <p className="text-sm text-brown-dark">{quote.reason}</p>
      ) : (
        <div className="space-y-4">
          <div className="flex justify-between text-sm border-b border-brown/10 pb-3">
            <span className="text-brown-light">Booth(s) {formatBoothCodes(quote.booths.map((b) => b.code))}</span>
            <span className="text-brown-dark font-medium tabular-nums">{formatAed(quote.totalAedFils)}</span>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <label className="text-xs text-brown-light flex flex-col gap-1">
              Payment method
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value as OfflinePaymentMethod)}
                className="border border-brown/20 rounded-lg px-2 py-2 bg-cream-soft text-sm text-brown-dark"
              >
                {OFFLINE_PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {paymentMethodLabel({ provider: "offline", method: m })}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-brown-light flex flex-col gap-1">
              Reference (required)
              <input
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                maxLength={120}
                placeholder="Bank ref, receipt no., terminal slip…"
                className="border border-brown/20 rounded-lg px-2 py-2 bg-cream-soft text-sm text-brown-dark"
              />
            </label>
          </div>
          <label className="text-xs text-brown-light flex flex-col gap-1">
            Internal note (optional, never shown to the vendor)
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={1000}
              rows={2}
              className="border border-brown/20 rounded-lg px-2 py-2 bg-cream-soft text-sm text-brown-dark"
            />
          </label>

          <label className="flex items-start gap-2 text-sm text-brown-dark cursor-pointer">
            <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-1" />
            <span>
              I confirm DAH has received <strong className="tabular-nums">{formatAed(quote.totalAedFils)}</strong> from this vendor. This
              confirms the booking, issues a receipt and notifies the vendor. It can&apos;t be undone here.
            </span>
          </label>

          {error && (
            <p className="text-sm text-red-700" role="alert">
              {error}
            </p>
          )}

          <Button loading={saving} disabled={saving || !confirmed || !reference.trim()} onClick={submit}>
            {saving ? "Recording…" : "Record payment & confirm booking"}
          </Button>
        </div>
      )}
    </section>
  );
}
