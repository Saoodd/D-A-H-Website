"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useLocale } from "@/lib/i18n/context";
import { Countdown } from "@/components/Countdown";
import { formatAed, DisplayStatus } from "@/lib/constants";
import { FloorPlan } from "@/components/floorplan/FloorPlan";
import { Legend } from "@/components/floorplan/Legend";
import { BoothConfirmModal } from "@/components/vendor/BoothConfirmModal";
import { SelectedBoothCard } from "@/components/vendor/SelectedBoothCard";
import { ReceiptSummaryCard } from "@/components/vendor/ReceiptSummaryCard";
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
    tiers: { sizeKey: string; label: string; priceAedFils: number; vatInclusive: boolean }[];
    floorPlanImageUrl: string | null;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [checkoutSession, setCheckoutSession] = useState<{ paymentId: string; amountAedFils: number } | null>(null);
  // A booth click never holds it immediately — it only opens the
  // confirmation modal below. The hold request itself only fires once the
  // vendor explicitly confirms (see confirmPendingBooth).
  const [pendingBooth, setPendingBooth] = useState<FloorBooth | null>(null);
  // Whether the 2-minute booth-selection session has run out client-side —
  // blocks further clicks and prompts a restart. The server independently
  // re-checks this at confirm time regardless of what the client believes.
  const [selectionExpired, setSelectionExpired] = useState(false);
  // Server-side verification gate (PART 16/17) — set when starting a booth
  // selection session or confirming a booth is refused because the vendor's
  // email/mobile aren't both verified yet. Shown as a clear prompt instead
  // of leaving the booth selector silently empty or surfacing a raw error.
  const [verificationRequired, setVerificationRequired] = useState(false);
  const startingSelectionRef = useRef(false);

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

  const startBoothSelectionSession = useCallback(async () => {
    if (startingSelectionRef.current) return;
    startingSelectionRef.current = true;
    try {
      const res = await fetch(`/api/applications/${applicationId}/booth-selection/start`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setSelectionExpired(false);
        setView((v) => ({ ...v, boothSelectionExpiresAt: data.boothSelectionExpiresAt }));
      } else {
        const body = await res.json().catch(() => ({}));
        if (body.code === "VERIFICATION_REQUIRED") setVerificationRequired(true);
      }
    } finally {
      startingSelectionRef.current = false;
    }
  }, [applicationId]);

  // Opening the booth selector (accepted, no active hold) starts — or
  // idempotently resumes — the 2-minute selection session. A page refresh
  // resumes the same server-tracked session rather than granting fresh time.
  useEffect(() => {
    if (view.displayStatus === "ACCEPTED_UNPAID" && !view.boothHold && !view.boothSelectionExpiresAt) {
      startBoothSelectionSession();
    }
  }, [view.displayStatus, view.boothHold, view.boothSelectionExpiresAt, startBoothSelectionSession]);

  const heldBoothRaw = floorplan?.booths.find((b) => b.id === view.boothHold?.boothId);
  const heldBoothTier = floorplan?.tiers.find((tr) => tr.sizeKey === heldBoothRaw?.size);

  const sizeStyles: Record<string, SizeStyle> = {};
  (floorplan?.tiers || []).forEach((tr, i) => {
    sizeStyles[tr.sizeKey] = { color: SIZE_PALETTE[i % SIZE_PALETTE.length], label: `${tr.label} — ${formatAed(tr.priceAedFils)}` };
  });

  async function confirmPendingBooth() {
    if (!pendingBooth) return;
    const booth = pendingBooth;
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch(`/api/booths/${booth.id}/hold`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ applicationId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        if (body.code === "VERIFICATION_REQUIRED") {
          setVerificationRequired(true);
          setPendingBooth(null);
          return;
        }
        if (body.code === "SELECTION_EXPIRED") {
          // A distinct state from "someone else took it" — the vendor's own
          // 2-minute focus window ran out before they confirmed anything.
          setNotice(
            locale === "ar"
              ? "انتهت جلسة اختيار الكشك. يرجى البدء من جديد."
              : "Your booth selection session has expired. Please start again."
          );
          setSelectionExpired(true);
          setPendingBooth(null);
          return;
        }
        // The server is the sole authority on availability — this is a
        // specific, actionable message (not a generic error) for the one
        // real race: someone else claimed the booth between the vendor's
        // click and their confirm.
        setNotice(
          locale === "ar"
            ? `الكشك ${booth.code} لم يعد متاحاً. يرجى اختيار كشك آخر.`
            : `Booth ${booth.code} is no longer available. Please choose another booth.`
        );
        setPendingBooth(null);
        await loadFloorplan();
        return;
      }
      setPendingBooth(null);
      await refreshStatus();
    } catch {
      setNotice(locale === "ar" ? "حدث خطأ ما" : "Something went wrong");
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
        if (b.code === "VERIFICATION_REQUIRED") {
          setVerificationRequired(true);
          setNotice(
            locale === "ar"
              ? "يرجى التحقق من بيانات التواصل الخاصة بك قبل المتابعة للدفع."
              : "Please verify your contact details before continuing to payment."
          );
          return;
        }
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
        <div className="mt-10 space-y-4">
          <p className="text-brown-light">
            {locale === "ar" ? "طلبك قيد المراجعة. سنرسل بريداً إلكترونياً عند اتخاذ قرار." : "Your application is under review. We'll email you once a decision is made."}
          </p>
          <div className="rounded-xl border border-brown/10 bg-cream p-6">
            <p className="text-xs uppercase tracking-wide text-brown-light mb-2">
              {locale === "ar" ? "ماذا يحدث بعد ذلك" : "What happens next"}
            </p>
            <p className="text-sm text-brown-dark leading-relaxed">
              {locale === "ar"
                ? "يراجع فريق دار الحي كل طلب يدوياً. عند اتخاذ قرار، ستصلك رسالة بريد إلكتروني وستُحدَّث حالة الطلب هنا تلقائياً — لا حاجة لإعادة التقديم أو المتابعة."
                : "Our team reviews every application by hand. Once a decision is made, you'll get an email and this page will update automatically — no need to reapply or follow up."}
            </p>
          </div>
        </div>
      )}

      {view.displayStatus === "REJECTED" && (
        <div className="mt-10 space-y-5">
          <p className="text-brown-light">
            {locale === "ar" ? "لم يتم قبول طلبك لهذه الفعالية." : "Your application wasn't accepted for this event."}
          </p>
          <Link
            href="/events"
            className="inline-block px-6 py-2.5 rounded-full border border-brown/30 text-sm text-brown-dark hover:bg-brown/10 transition-colors"
          >
            {locale === "ar" ? "تصفح الفعاليات القادمة" : "Browse Upcoming Events"}
          </Link>
        </div>
      )}

      {view.displayStatus === "EXPIRED" && (
        <div className="mt-10 space-y-5">
          <p className="text-brown-light">
            {locale === "ar"
              ? "انتهت مهلة القبول قبل إتمام الدفع، لذلك لم يعد بإمكانك إكمال هذا الحجز."
              : "Your acceptance window closed before payment was completed, so this booking can no longer be finished."}
          </p>
          <div className="flex flex-wrap gap-3">
            <a
              href="/contact"
              className="inline-block px-6 py-2.5 rounded-full bg-brown text-cream-soft text-sm hover:bg-brown-dark transition-colors"
            >
              {locale === "ar" ? "تواصل معنا لإعادة القبول" : "Contact us about re-acceptance"}
            </a>
            <Link
              href="/events"
              className="inline-block px-6 py-2.5 rounded-full border border-brown/30 text-sm text-brown-dark hover:bg-brown/10 transition-colors"
            >
              {locale === "ar" ? "تصفح الفعاليات القادمة" : "Browse Upcoming Events"}
            </Link>
          </div>
        </div>
      )}

      {view.displayStatus === "ACCEPTED_UNPAID" && (
        <div className="mt-8">
          {view.acceptanceExpiresAt && (
            <div className="mb-6 rounded-xl bg-cream border border-brown/10 px-5 py-4 flex items-center justify-between flex-wrap gap-2">
              <span className="text-sm text-brown-light">{t("vendor.deadlineLabel")}</span>
              <Countdown target={view.acceptanceExpiresAt} onExpire={refreshStatus} variant="hm" className="text-sm text-brown-dark" />
            </div>
          )}

          {verificationRequired ? (
            <div className="rounded-xl border border-brown/10 bg-cream p-8 text-center">
              <h2 className="font-heading text-xl text-brown-dark mb-2">
                {locale === "ar" ? "تحقق من حسابك" : "Verify Your Account"}
              </h2>
              <p className="text-sm text-brown-light mb-5">
                {locale === "ar"
                  ? "قبل اختيار كشكك، يرجى التحقق من بيانات التواصل الخاصة بك."
                  : "Before selecting your booth, please verify your contact details."}
              </p>
              <Link
                href="/vendor/verify"
                className="inline-block px-6 py-2.5 rounded-full bg-brown text-cream-soft text-sm hover:bg-brown-dark transition-colors"
              >
                {locale === "ar" ? "إكمال التحقق" : "Complete Verification"}
              </Link>
            </div>
          ) : (
            !view.boothHold && (
            <div>
              <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
                <h2 className="font-heading text-xl text-brown-dark">{t("vendor.selectBooth")}</h2>
                {!selectionExpired && view.boothSelectionExpiresAt && (
                  <span className="text-sm">
                    <span className="text-brown-light">{locale === "ar" ? "اختر كشكك خلال" : "Choose your booth within"}</span>{" "}
                    <Countdown
                      target={view.boothSelectionExpiresAt}
                      variant="mmss"
                      onExpire={() => setSelectionExpired(true)}
                      className="font-semibold text-brown-dark text-base"
                    />
                  </span>
                )}
              </div>

              {selectionExpired ? (
                <div className="rounded-xl border border-brown/10 bg-cream p-8 text-center">
                  <p className="text-brown-dark mb-4">
                    {locale === "ar" ? "انتهت جلسة اختيار الكشك. يمكنك البدء من جديد." : "Your booth-selection session has expired. You can start again."}
                  </p>
                  <button onClick={startBoothSelectionSession} className="px-6 py-2.5 rounded-full bg-brown text-cream-soft text-sm hover:bg-brown-dark">
                    {locale === "ar" ? "البدء من جديد" : "Start Again"}
                  </button>
                </div>
              ) : floorplan ? (
                <>
                  <FloorPlan
                    features={floorplan.features}
                    booths={floorplan.booths}
                    sizeStyles={sizeStyles}
                    backgroundImageUrl={floorplan.floorPlanImageUrl}
                    onSelectBooth={setPendingBooth}
                  />
                  <Legend sizeStyles={sizeStyles} />
                </>
              ) : (
                <p className="text-brown-light text-sm">{locale === "ar" ? "جارٍ التحميل…" : "Loading floor plan…"}</p>
              )}
              {pendingBooth && !selectionExpired && (
                <BoothConfirmModal
                  booth={pendingBooth}
                  tiers={floorplan?.tiers || []}
                  eventName={view.event.name}
                  busy={busy}
                  onConfirm={confirmPendingBooth}
                  onCancel={() => setPendingBooth(null)}
                />
              )}
            </div>
            )
          )}

          {view.boothHold && view.boothHold.holdStage === "REVIEW" && (
            <div className="space-y-5">
              <SelectedBoothCard
                code={view.boothHold.code}
                sizeLabel={heldBoothTier?.label}
                priceAedFils={heldBoothRaw?.priceAedFils ?? heldBoothTier?.priceAedFils}
                eventName={view.event.name}
              />
              <div className="flex gap-3">
                {view.eventTermsRequired && !view.eventTermsAccepted ? (
                  <Link
                    href={`/vendor/applications/${applicationId}/terms`}
                    className="px-6 py-2.5 rounded-full bg-brown text-cream-soft text-sm hover:bg-brown-dark"
                  >
                    {locale === "ar" ? "مراجعة وقبول شروط الفعالية" : "Review & Accept Event Terms"}
                  </Link>
                ) : (
                  <button
                    onClick={proceedToPayment}
                    disabled={busy}
                    className="px-6 py-2.5 rounded-full bg-brown text-cream-soft text-sm hover:bg-brown-dark disabled:opacity-50"
                  >
                    {locale === "ar" ? "المتابعة للدفع" : "Continue to Payment"}
                  </button>
                )}
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
                <div className="mb-5">
                  <p className="text-sm text-brown-dark">
                    {locale === "ar" ? `الكشك ${view.boothHold.code} محجوز للدفع` : `Booth ${view.boothHold.code} reserved for payment`}
                  </p>
                  <Countdown
                    target={view.boothHold.holdExpiresAt}
                    variant="mmss"
                    onExpire={refreshStatus}
                    className="font-semibold text-brown-dark text-lg"
                  />
                </div>
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
                {process.env.NODE_ENV !== "production" && (
                  <button
                    onClick={() => pay("FAILED")}
                    disabled={busy}
                    className="w-full py-2 rounded-full border border-red-300 text-red-700 text-xs disabled:opacity-50"
                  >
                    {locale === "ar" ? "محاكاة فشل الدفع (تجريبي، للتطوير فقط)" : "Simulate a failed payment (dev only)"}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {view.displayStatus === "PAID" && (
        <div className="mt-8 space-y-6">
          <div className="rounded-[10px] border border-brown/10 bg-cream p-7 sm:p-8">
            <p className="label-caps mb-4">{locale === "ar" ? "مؤكد ومدفوع" : "Confirmed & Paid"}</p>
            <p className="text-xs uppercase tracking-wide text-brown-light mb-1">{locale === "ar" ? "كشكك" : "Your Booth"}</p>
            <p className="font-heading text-5xl sm:text-6xl text-brown-dark leading-none tracking-tight">{view.soldBooth?.code}</p>
            {view.soldBooth?.soldAt && (
              <p className="mt-5 pt-5 border-t border-brown/10 text-sm text-brown-light">
                {locale === "ar" ? "تم الدفع في" : "Paid on"}{" "}
                {new Date(view.soldBooth.soldAt).toLocaleDateString(locale === "ar" ? "ar-AE" : "en-AE", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </p>
            )}
          </div>

          {/* The event-specific vendor group is the highest-priority action on
              this page after seeing the booth itself — deliberately placed
              above the receipt so it's never missed by a vendor who doesn't
              scroll further. Server-side, view.event.whatsappVendorGroupLink
              is only ever populated when this vendor's own application for
              this event is PAID and the event has a link configured — never
              exposed otherwise, and never confused with the separate,
              account-level Main DAH Community link shown elsewhere. */}
          {view.event.whatsappVendorGroupLink && (
            <div className="rounded-[10px] border border-brown/10 bg-cream p-7 sm:p-8">
              <p className="label-caps mb-2">{locale === "ar" ? "مجموعة بائعي الفعالية" : "Event Vendor Group"}</p>
              <p className="text-sm text-brown-light mb-5">
                {locale === "ar"
                  ? `انضم إلى مجموعة واتساب الخاصة ببائعي ${view.event.name} لتصلك تعليمات الإعداد وتحديثات البائعين والإعلانات المهمة.`
                  : `Join the private WhatsApp group for ${view.event.name} to receive setup instructions, vendor updates and important event announcements.`}
              </p>
              <a
                href={view.event.whatsappVendorGroupLink}
                target="_blank"
                rel="noreferrer"
                className="inline-block px-7 py-3 rounded-full bg-brown text-cream-soft text-sm tracking-wide hover:bg-brown-dark transition-colors"
              >
                {locale === "ar" ? "انضم إلى مجموعة واتساب" : "Join WhatsApp Group"}
              </a>
            </div>
          )}

          {view.receipt && <ReceiptSummaryCard receipt={view.receipt} />}

          {view.receipt && (
            <a
              href={`/vendor/receipts/${view.receipt.paymentId}?mode=download`}
              target="_blank"
              rel="noreferrer"
              className="inline-block px-6 py-2.5 rounded-full border border-brown/30 text-sm text-brown-dark hover:bg-brown/10 transition-colors"
            >
              {locale === "ar" ? "تنزيل الإيصال" : "Download Receipt"}
            </a>
          )}

          {view.cancellationRequested ? (
            <p className="text-sm text-brown-light">
              {locale === "ar" ? "تم إرسال طلب الإلغاء — سيتواصل معك فريقنا." : "Cancellation requested — our team will follow up with you."}
            </p>
          ) : (
            <p className="text-xs text-brown-light">
              {locale === "ar" ? "بحاجة للمساعدة بخصوص حجزك؟" : "Need help with your booking?"}{" "}
              <a href="/contact" className="underline">
                {locale === "ar" ? "تواصل مع دار الحي" : "Contact DAH"}
              </a>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
