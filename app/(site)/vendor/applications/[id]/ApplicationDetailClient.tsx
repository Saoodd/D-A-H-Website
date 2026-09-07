"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useLocale } from "@/lib/i18n/context";
import { Countdown } from "@/components/Countdown";
import { formatAed, DisplayStatus } from "@/lib/constants";
import { FloorPlan } from "@/components/floorplan/FloorPlan";
import { Legend } from "@/components/floorplan/Legend";
import type { FloorBooth, FloorFeature, SizeStyle } from "@/components/floorplan/types";
import type { ApplicationView } from "@/lib/applicationView";

const SIZE_PALETTE = ["#C97C4B", "#8A5A38", "#D9A066", "#6B4429"];

const statusColor: Record<DisplayStatus, string> = {
  PENDING: "bg-cream-deep text-brown-dark",
  REJECTED: "bg-red-100 text-red-800",
  ACCEPTED_UNPAID: "bg-amber-100 text-amber-800",
  PAID: "bg-green-100 text-green-800",
  EXPIRED: "bg-zinc-200 text-zinc-700",
};

export function ApplicationDetailClient({
  initialView,
  applicationId,
}: {
  initialView: ApplicationView;
  applicationId: string;
}) {
  const { t, locale } = useLocale();
  const [view, setView] = useState(initialView);
  const [floorplan, setFloorplan] = useState<{
    features: FloorFeature[];
    booths: FloorBooth[];
    tiers: { sizeKey: string; label: string; priceAedFils: number }[];
    floorPlanImageUrl: string | null;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [checkoutSession, setCheckoutSession] = useState<{ paymentId: string; amountAedFils: number } | null>(null);
  const [cancelReason, setCancelReason] = useState("");

  const refreshStatus = useCallback(async () => {
    const res = await fetch(`/api/applications/${applicationId}/status`);
    if (res.ok) setView(await res.json());
  }, [applicationId]);

  useEffect(() => {
    const id = setInterval(refreshStatus, 4000);
    return () => clearInterval(id);
  }, [refreshStatus]);

  const loadFloorplan = useCallback(async () => {
    const res = await fetch(`/api/events/${view.event.id}/floorplan?applicationId=${applicationId}`);
    if (res.ok) setFloorplan(await res.json());
  }, [applicationId, view.event.id]);

  useEffect(() => {
    if (view.displayStatus === "ACCEPTED_UNPAID" && !view.boothHold) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch floor plan when entering booth-selection state
      loadFloorplan();
    }
  }, [view.displayStatus, view.boothHold, loadFloorplan]);

  const sizeStyles: Record<string, SizeStyle> = {};
  (floorplan?.tiers || []).forEach((tr, i) => {
    sizeStyles[tr.sizeKey] = { color: SIZE_PALETTE[i % SIZE_PALETTE.length], label: `${tr.label} — ${formatAed(tr.priceAedFils)}` };
  });

  async function selectBooth(booth: FloorBooth) {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch(`/api/booths/${booth.id}/hold`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ applicationId }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.error || "Could not hold that booth");
      }
      await refreshStatus();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function changeBooth() {
    if (!view.boothHold) return;
    setBusy(true);
    try {
      await fetch(`/api/booths/${view.boothHold.boothId}/release`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ applicationId }),
      });
      setCheckoutSession(null);
      await refreshStatus();
      await loadFloorplan();
    } finally {
      setBusy(false);
    }
  }

  async function proceedToPayment() {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch(`/api/checkout/${applicationId}/start`, { method: "POST" });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.error || "Could not start checkout");
      }
      const data = await res.json();
      setCheckoutSession({ paymentId: data.paymentId, amountAedFils: data.amountAedFils });
      await refreshStatus();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function pay(outcome: "SUCCEEDED" | "FAILED") {
    const paymentId = checkoutSession?.paymentId || view.latestPayment?.id;
    if (!paymentId) return;
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch(`/api/checkout/${applicationId}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentId, outcome }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Payment failed");
      if (data.status === "FAILED") {
        setNotice(locale === "ar" ? "فشلت عملية الدفع. حاول مرة أخرى." : "Payment failed — you can try again.");
      }
      await refreshStatus();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function requestCancellation() {
    setBusy(true);
    try {
      const res = await fetch(`/api/cancel/${applicationId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: cancelReason }),
      });
      if (res.ok) {
        setNotice(locale === "ar" ? "تم إرسال طلب الإلغاء." : "Cancellation request sent.");
        await refreshStatus();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container-page py-16 max-w-3xl">
      <Link href="/vendor/dashboard" className="text-sm text-brown-light underline">
        &larr; {locale === "ar" ? "لوحتي" : "My Dashboard"}
      </Link>

      <div className="mt-4 flex items-center justify-between flex-wrap gap-3">
        <h1 className="font-heading text-2xl md:text-3xl text-brown-dark">{view.event.name}</h1>
        <span className={`text-xs px-3 py-1 rounded-full ${statusColor[view.displayStatus]}`}>
          {t(`vendor.status.${view.displayStatus}`)}
        </span>
      </div>
      <p className="text-sm text-brown-light mt-1">
        {new Date(view.event.startDate).toLocaleDateString(locale === "ar" ? "ar-AE" : "en-AE")} ·{" "}
        {view.event.location}
      </p>

      {notice && (
        <div className="mt-6 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-sm px-4 py-3">
          {notice}
        </div>
      )}

      {view.displayStatus === "PENDING" && (
        <p className="mt-10 text-brown-light">
          {locale === "ar" ? "طلبك قيد المراجعة. سنرسل بريداً إلكترونياً عند اتخاذ قرار." : "Your application is under review. We'll email you once a decision is made."}
        </p>
      )}

      {view.displayStatus === "REJECTED" && (
        <p className="mt-10 text-brown-light">
          {locale === "ar" ? "لم يتم قبول طلبك لهذه الفعالية." : "Your application wasn't accepted for this event."}
        </p>
      )}

      {view.displayStatus === "EXPIRED" && (
        <p className="mt-10 text-brown-light">
          {locale === "ar"
            ? "انتهت مهلة القبول قبل إتمام الدفع. تواصل معنا إن كنت ترغب بإعادة القبول."
            : "Your acceptance window expired before payment was completed. Contact us if you'd like to be re-accepted."}
        </p>
      )}

      {view.displayStatus === "ACCEPTED_UNPAID" && (
        <div className="mt-8">
          {view.acceptanceExpiresAt && (
            <div className="mb-6 rounded-xl bg-cream border border-brown/10 px-5 py-4 flex items-center justify-between flex-wrap gap-2">
              <span className="text-sm text-brown-dark">{t("vendor.deadlineLabel")}</span>
              <Countdown target={view.acceptanceExpiresAt} onExpire={refreshStatus} className="text-lg text-brown" />
            </div>
          )}

          {!view.boothHold && (
            <div>
              <h2 className="font-heading text-xl text-brown-dark mb-3">{t("vendor.selectBooth")}</h2>
              {floorplan ? (
                <>
                  <FloorPlan
                    features={floorplan.features}
                    booths={floorplan.booths}
                    sizeStyles={sizeStyles}
                    backgroundImageUrl={floorplan.floorPlanImageUrl}
                    onSelectBooth={selectBooth}
                  />
                  <Legend sizeStyles={sizeStyles} />
                </>
              ) : (
                <p className="text-brown-light text-sm">{locale === "ar" ? "جارٍ التحميل…" : "Loading floor plan…"}</p>
              )}
            </div>
          )}

          {view.boothHold && view.boothHold.holdStage === "REVIEW" && (
            <div className="rounded-xl border border-brown/10 bg-cream p-6">
              <p className="text-sm text-brown-light">{locale === "ar" ? "الكشك المختار" : "Selected booth"}</p>
              <p className="font-heading text-2xl text-brown-dark">{view.boothHold.code}</p>
              {view.boothHold.holdExpiresAt && (
                <p className="mt-2 text-sm text-brown-light">
                  {locale === "ar" ? "احجز خلال" : "Hold expires in"}{" "}
                  <Countdown target={view.boothHold.holdExpiresAt} onExpire={refreshStatus} />
                </p>
              )}
              <div className="mt-5 flex gap-3">
                <button
                  onClick={proceedToPayment}
                  disabled={busy}
                  className="px-6 py-2.5 rounded-full bg-brown text-cream-soft text-sm hover:bg-brown-dark disabled:opacity-50"
                >
                  {locale === "ar" ? "المتابعة للدفع" : "Proceed to payment"}
                </button>
                <button onClick={changeBooth} disabled={busy} className="px-6 py-2.5 rounded-full border border-brown/30 text-sm disabled:opacity-50">
                  {locale === "ar" ? "اختيار كشك آخر" : "Choose a different booth"}
                </button>
              </div>
            </div>
          )}

          {view.boothHold && view.boothHold.holdStage === "PAYMENT" && (
            <div className="rounded-xl border border-brown/10 bg-cream p-6">
              <h2 className="font-heading text-xl text-brown-dark mb-1">{t("checkout.title")}</h2>
              <p className="text-xs text-brown-light mb-4">{t("checkout.sandboxNotice")}</p>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-brown-light">{locale === "ar" ? "الكشك" : "Booth"}</span>
                <span>{view.boothHold.code}</span>
              </div>
              <div className="flex justify-between text-sm mb-4">
                <span className="text-brown-light">{locale === "ar" ? "المبلغ" : "Amount"}</span>
                <span className="text-brown font-medium">
                  {formatAed(checkoutSession?.amountAedFils ?? view.latestPayment?.amountAedFils ?? 0)}
                </span>
              </div>
              {view.boothHold.holdExpiresAt && (
                <p className="text-sm text-brown-light mb-5">
                  {locale === "ar" ? "أكمل الدفع خلال" : "Complete payment within"}{" "}
                  <Countdown target={view.boothHold.holdExpiresAt} onExpire={refreshStatus} />
                </p>
              )}
              <div className="flex flex-col gap-3">
                <button
                  onClick={() => pay("SUCCEEDED")}
                  disabled={busy}
                  className="w-full py-3 rounded-full bg-black text-white text-sm font-medium disabled:opacity-50"
                >
                   {t("checkout.payWithApplePay")}
                </button>
                <button
                  onClick={() => pay("SUCCEEDED")}
                  disabled={busy}
                  className="w-full py-3 rounded-full bg-brown text-cream-soft text-sm disabled:opacity-50"
                >
                  {t("checkout.payWithCard")}
                </button>
                <button
                  onClick={() => pay("FAILED")}
                  disabled={busy}
                  className="w-full py-2 rounded-full border border-red-300 text-red-700 text-xs disabled:opacity-50"
                >
                  {locale === "ar" ? "محاكاة فشل الدفع (تجريبي)" : "Simulate a failed payment (sandbox)"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {view.displayStatus === "PAID" && (
        <div className="mt-8 space-y-6">
          <div className="rounded-xl border border-green-200 bg-green-50 p-6">
            <p className="text-sm text-green-800">{locale === "ar" ? "تم تأكيد الكشك" : "Your booth is confirmed"}</p>
            <p className="font-heading text-2xl text-brown-dark mt-1">{view.soldBooth?.code}</p>
            {view.soldBooth?.priceAedFils != null && (
              <p className="text-sm text-brown-light mt-1">{formatAed(view.soldBooth.priceAedFils)} paid</p>
            )}
            {view.soldBooth?.soldAt && (
              <p className="text-xs text-brown-light">{new Date(view.soldBooth.soldAt).toLocaleString()}</p>
            )}
          </div>

          {view.event.whatsappVendorGroupLink && (
            <div className="rounded-xl border border-brown/10 bg-cream p-6 flex items-center justify-between flex-wrap gap-3">
              <span className="text-sm text-brown-dark">{locale === "ar" ? "مجموعة واتساب لهذه الفعالية" : "This event's vendor WhatsApp group"}</span>
              <a
                href={view.event.whatsappVendorGroupLink}
                target="_blank"
                rel="noreferrer"
                className="px-5 py-2 rounded-full bg-brown text-cream-soft text-sm hover:bg-brown-dark"
              >
                {locale === "ar" ? "انضم" : "Join"}
              </a>
            </div>
          )}

          {!view.cancellationRequested ? (
            <div className="rounded-xl border border-brown/10 p-6">
              <p className="text-sm text-brown-light mb-3">{locale === "ar" ? "بحاجة للإلغاء؟" : "Need to cancel?"}</p>
              <textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder={locale === "ar" ? "السبب (اختياري)" : "Reason (optional)"}
                rows={2}
                className="w-full border border-brown/20 rounded-lg px-3 py-2 bg-cream-soft text-sm mb-3"
              />
              <button
                onClick={requestCancellation}
                disabled={busy}
                className="px-5 py-2 rounded-full border border-red-300 text-red-700 text-sm disabled:opacity-50"
              >
                {t("vendor.cancelBooth")}
              </button>
            </div>
          ) : (
            <p className="text-sm text-brown-light">
              {locale === "ar" ? "تم إرسال طلب الإلغاء — سيتواصل معك فريقنا." : "Cancellation requested — our team will follow up with you."}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
