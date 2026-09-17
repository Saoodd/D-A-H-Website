"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useLocale } from "@/lib/i18n/context";
import { Countdown } from "@/components/Countdown";
import { formatAed, splitVatInclusiveTotal, formatBoothCodes, MAX_BOOTHS_PER_BOOKING, DisplayStatus } from "@/lib/constants";
import { BoothSelector } from "@/components/vendor/BoothSelector";
import { BoothConfirmModal } from "@/components/vendor/BoothConfirmModal";
import { SelectedBoothCard } from "@/components/vendor/SelectedBoothCard";
import { ReceiptSummaryCard } from "@/components/vendor/ReceiptSummaryCard";
import { PhoneVerifyModal } from "@/components/vendor/PhoneVerifyModal";
import { SetupSizeModal } from "@/components/vendor/SetupSizeModal";
import { FloorPlan } from "@/components/floorplan/FloorPlan";
import { Legend } from "@/components/floorplan/Legend";
import type { FloorBooth, FloorFeature, SizeStyle } from "@/components/floorplan/types";
import type { ApplicationView } from "@/lib/applicationView";
import { checkMultiBoothFit, isProvablyAdjacent } from "@/lib/boothFit";

const SIZE_PALETTE = ["#C97C4B", "#8A5A38", "#D9A066", "#6B4429"];

const statusColor: Record<DisplayStatus, string> = {
  PENDING: "bg-cream-deep text-brown-dark",
  REJECTED: "bg-red-100 text-red-800",
  ACCEPTED_UNPAID: "bg-amber-100 text-amber-800",
  PAID: "bg-green-100 text-green-800",
  EXPIRED: "bg-zinc-200 text-zinc-700",
};

interface FloorplanData {
  features: FloorFeature[];
  booths: FloorBooth[];
  tiers: { sizeKey: string; label: string; priceAedFils: number; vatInclusive: boolean }[];
  floorPlanImageUrl: string | null;
  allowMultipleBooths: boolean;
}

export function ApplicationDetailClient({
  initialView,
  applicationId,
}: {
  initialView: ApplicationView;
  applicationId: string;
}) {
  const { t, locale } = useLocale();
  const isAr = locale === "ar";
  const [view, setView] = useState(initialView);
  const [floorplan, setFloorplan] = useState<FloorplanData | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [checkoutSession, setCheckoutSession] = useState<{ paymentId: string; amountAedFils: number } | null>(null);
  // A booth click never holds it immediately — it only opens the
  // confirmation modal below. The hold request itself only fires once the
  // vendor explicitly confirms (see confirmPendingBooth / confirmStaged).
  const [pendingBooth, setPendingBooth] = useState<FloorBooth | null>(null);
  // Multi-booth: booths the vendor has confirmed-in-modal but that are NOT
  // yet held server-side — purely client-side staging. Nothing is reserved
  // until "Confirm Booth(s)" fires the one atomic hold request for the
  // whole set (see requirement: no partial-booking state).
  const [stagedBooths, setStagedBooths] = useState<FloorBooth[]>([]);
  const [multiMode, setMultiMode] = useState(false);
  const [editingSetupSize, setEditingSetupSize] = useState(false);
  const [mapFocusNonce, setMapFocusNonce] = useState(1);
  // Server-side phone-verification gate — set when confirming a booth or
  // starting checkout is refused because the vendor's mobile number isn't
  // verified yet. Opens the inline PhoneVerifyModal; on success, resumes
  // whichever action was blocked.
  const [verifyIntent, setVerifyIntent] = useState<"confirm-booth" | "checkout" | null>(null);

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

  const hasHold = view.boothHolds.length > 0;

  useEffect(() => {
    if (view.displayStatus === "ACCEPTED_UNPAID" && !hasHold) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch floor plan when entering booth-selection state
      loadFloorplan();
    }
    // The confirmed booking's floor plan (read-only, booth(s) highlighted) —
    // fetched once on landing here, never polled (nothing changes once paid).
    if (view.displayStatus === "PAID" && !floorplan) {
      loadFloorplan();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- floorplan presence checked intentionally, not tracked as a dep (would refetch on every set)
  }, [view.displayStatus, hasHold, loadFloorplan]);

  // Silent live/background availability refresh: keep the map/list up to
  // date while the vendor is actively browsing (not yet holding anything) —
  // the same authoritative data the hold endpoint itself checks, just
  // refreshed proactively here so a booth someone else just took visibly
  // updates without a page reload, without resetting zoom/pan/search/filter
  // (this only ever calls setFloorplan on data already flowing into
  // FloorPlan/BoothSelector as props — neither component is remounted by
  // it). No browsing timer gates this anymore — browsing simply never
  // reserves anything, so there's no session to expire. Deliberately NOT
  // polled once a hold exists (that stage has its own countdown-driven
  // refreshStatus already).
  useEffect(() => {
    if (view.displayStatus !== "ACCEPTED_UNPAID" || hasHold) return;
    const id = setInterval(loadFloorplan, 6000);
    return () => clearInterval(id);
  }, [view.displayStatus, hasHold, loadFloorplan]);

  // A booth the vendor has already confirmed-in-modal but not yet held
  // server-side (multi-booth staging — see stagedBooths above) can still be
  // taken by someone else in the meantime. Every time the live background
  // refresh brings in fresh availability, drop any staged booth that's no
  // longer available and surface the same notice a single-booth selection
  // gets — this is UX only; the atomic hold at "Confirm Booths" is the real
  // authoritative check either way.
  useEffect(() => {
    if (!floorplan || stagedBooths.length === 0) return;
    const stillAvailable = new Set(floorplan.booths.filter((b) => b.status === "AVAILABLE" || b.isMine).map((b) => b.id));
    const lost = stagedBooths.filter((b) => !stillAvailable.has(b.id));
    if (lost.length === 0) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reacting to fresh external availability data landing via polling, not deriving from own render
    setStagedBooths((prev) => prev.filter((b) => stillAvailable.has(b.id)));
    setNotice(
      isAr
        ? `أصبح ${lost.map((b) => b.code).join(" + ")} غير متاح للتو. يرجى اختيار كشك آخر.`
        : `${lost.map((b) => b.code).join(" + ")} has just become unavailable. Please choose another booth.`
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally re-derives only from fresh floorplan data, not stagedBooths itself (would loop)
  }, [floorplan, isAr]);

  const sizeStyles: Record<string, SizeStyle> = {};
  (floorplan?.tiers || []).forEach((tr, i) => {
    sizeStyles[tr.sizeKey] = { color: SIZE_PALETTE[i % SIZE_PALETTE.length], label: `${tr.label} — ${formatAed(tr.priceAedFils)}` };
  });

  const tierBySizeKey = useMemo(() => new Map((floorplan?.tiers || []).map((t) => [t.sizeKey, t])), [floorplan]);

  function boothLine(code: string) {
    const raw = floorplan?.booths.find((b) => b.id === view.boothHolds.find((h) => h.code === code)?.boothId || b.code === code);
    const tier = raw ? tierBySizeKey.get(raw.size) : undefined;
    return { raw, tier };
  }

  const maxBooths = MAX_BOOTHS_PER_BOOKING;

  async function holdBooths(boothIds: string[]) {
    const res = await fetch(`/api/applications/${applicationId}/booths/hold`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ boothIds }),
    });
    return res;
  }

  async function confirmPendingBooth() {
    if (!pendingBooth) return;
    const booth = pendingBooth;
    if (multiMode) {
      // Staging only — no server call. See requirement: two-booth atomic
      // hold happens only once, at "Confirm Booth(s)".
      setStagedBooths((prev) => (prev.some((b) => b.id === booth.id) ? prev : [...prev, booth]));
      setPendingBooth(null);
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const res = await holdBooths([booth.id]);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        if (body.code === "VERIFICATION_REQUIRED") {
          setVerifyIntent("confirm-booth");
          return;
        }
        setNotice(body.error || (isAr ? `الكشك ${booth.code} لم يعد متاحاً. يرجى اختيار كشك آخر.` : `Booth ${booth.code} is no longer available. Please choose another booth.`));
        setPendingBooth(null);
        await loadFloorplan();
        return;
      }
      setPendingBooth(null);
      await refreshStatus();
    } catch {
      setNotice(isAr ? "حدث خطأ ما" : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function confirmStagedBooths() {
    if (stagedBooths.length === 0) return;
    setBusy(true);
    setNotice(null);
    try {
      const res = await holdBooths(stagedBooths.map((b) => b.id));
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        if (body.code === "VERIFICATION_REQUIRED") {
          setVerifyIntent("confirm-booth");
          return;
        }
        if (body.code === "BOOTH_UNAVAILABLE" && body.boothCode) {
          setNotice(body.error);
          setStagedBooths((prev) => prev.filter((b) => b.code !== body.boothCode));
          await loadFloorplan();
          return;
        }
        setNotice(body.error || (isAr ? "تعذر تأكيد الأكشاك المختارة." : "Could not confirm the selected booths."));
        return;
      }
      setStagedBooths([]);
      setMultiMode(false);
      await refreshStatus();
    } catch {
      setNotice(isAr ? "حدث خطأ ما" : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  function removeStagedBooth(id: string) {
    setStagedBooths((prev) => prev.filter((b) => b.id !== id));
  }

  async function changeBooth() {
    if (!hasHold) return;
    setBusy(true);
    try {
      await Promise.all(
        view.boothHolds.map((h) =>
          fetch(`/api/booths/${h.boothId}/release`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ applicationId }),
          })
        )
      );
      setCheckoutSession(null);
      setStagedBooths([]);
      setMultiMode(false);
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
          setVerifyIntent("checkout");
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
        setNotice(isAr ? "فشلت عملية الدفع. حاول مرة أخرى." : "Payment failed — you can try again.");
      }
      await refreshStatus();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function saveSetupSize(widthMm: number, depthMm: number) {
    const res = await fetch(`/api/applications/${applicationId}/setup-size`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ widthMm, depthMm }),
    });
    if (res.ok) {
      setView((v) => ({ ...v, setupWidthMm: widthMm, setupDepthMm: depthMm }));
      setEditingSetupSize(false);
    }
    return res.ok;
  }

  // Combined price breakdown across every currently held/staged booth —
  // never trusted for the actual charge (checkout is server-computed) but
  // used purely to preview the same totals before payment.
  function combinedTotals(boothIds: string[]) {
    let subtotal = 0,
      vat = 0,
      total = 0;
    const lines = boothIds.map((code) => {
      const { raw, tier } = boothLine(code);
      const price = raw?.priceAedFils ?? tier?.priceAedFils ?? null;
      if (price != null) {
        total += price;
        if (tier?.vatInclusive ?? true) {
          const split = splitVatInclusiveTotal(price);
          subtotal += split.baseAedFils;
          vat += split.vatAedFils;
        } else {
          subtotal += price;
        }
      }
      return { code, price, sizeLabel: raw ? (tierBySizeKey.get(raw.size)?.label ?? raw.size) : tier?.label ?? "" };
    });
    return { lines, subtotal, vat, total };
  }

  const holdCodes = view.boothHolds.map((h) => h.code);
  const heldTotals = combinedTotals(holdCodes);

  return (
    <div className="container-page py-16 max-w-3xl">
      <Link href="/vendor/dashboard" className="text-sm text-brown-light underline">
        &larr; {isAr ? "لوحتي" : "My Dashboard"}
      </Link>

      <div className="mt-4 flex items-center justify-between flex-wrap gap-3">
        <h1 className="font-heading text-2xl md:text-3xl text-brown-dark">{view.event.name}</h1>
        <span className={`text-xs px-3 py-1 rounded-full ${statusColor[view.displayStatus]}`}>
          {t(`vendor.status.${view.displayStatus}`)}
        </span>
      </div>
      <p className="text-sm text-brown-light mt-1">
        {new Date(view.event.startDate).toLocaleDateString(isAr ? "ar-AE" : "en-AE")} · {view.event.location}
      </p>

      {notice && (
        <div className="mt-6 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-sm px-4 py-3">{notice}</div>
      )}

      {view.displayStatus === "PENDING" && (
        <div className="mt-10 space-y-4">
          <p className="text-brown-light">
            {isAr ? "طلبك قيد المراجعة. سنرسل بريداً إلكترونياً عند اتخاذ قرار." : "Your application is under review. We'll email you once a decision is made."}
          </p>
          <div className="rounded-xl border border-brown/10 bg-cream p-6">
            <p className="text-xs uppercase tracking-wide text-brown-light mb-2">{isAr ? "ماذا يحدث بعد ذلك" : "What happens next"}</p>
            <p className="text-sm text-brown-dark leading-relaxed">
              {isAr
                ? "يراجع فريق دار الحي كل طلب يدوياً. عند اتخاذ قرار، ستصلك رسالة بريد إلكتروني وستُحدَّث حالة الطلب هنا تلقائياً — لا حاجة لإعادة التقديم أو المتابعة."
                : "Our team reviews every application by hand. Once a decision is made, you'll get an email and this page will update automatically — no need to reapply or follow up."}
            </p>
          </div>
        </div>
      )}

      {view.displayStatus === "REJECTED" && (
        <div className="mt-10 space-y-5">
          <p className="text-brown-light">{isAr ? "لم يتم قبول طلبك لهذه الفعالية." : "Your application wasn't accepted for this event."}</p>
          <Link href="/events" className="inline-block px-6 py-2.5 rounded-full border border-brown/30 text-sm text-brown-dark hover:bg-brown/10 transition-colors">
            {isAr ? "تصفح الفعاليات القادمة" : "Browse Upcoming Events"}
          </Link>
        </div>
      )}

      {view.displayStatus === "EXPIRED" && (
        <div className="mt-10 space-y-5">
          <p className="text-brown-light">
            {isAr
              ? "انتهت مهلة القبول قبل إتمام الدفع، لذلك لم يعد بإمكانك إكمال هذا الحجز."
              : "Your acceptance window closed before payment was completed, so this booking can no longer be finished."}
          </p>
          <div className="flex flex-wrap gap-3">
            <a href="/contact" className="inline-block px-6 py-2.5 rounded-full bg-brown text-cream-soft text-sm hover:bg-brown-dark transition-colors">
              {isAr ? "تواصل معنا لإعادة القبول" : "Contact us about re-acceptance"}
            </a>
            <Link href="/events" className="inline-block px-6 py-2.5 rounded-full border border-brown/30 text-sm text-brown-dark hover:bg-brown/10 transition-colors">
              {isAr ? "تصفح الفعاليات القادمة" : "Browse Upcoming Events"}
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

          {!hasHold && (
            <div>
              <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
                <h2 className="font-heading text-xl text-brown-dark">{t("vendor.selectBooth")}</h2>
              </div>

              {(view.setupWidthMm == null || view.setupDepthMm == null) && !editingSetupSize && (
                <div className="mb-4 rounded-[8px] border border-amber-300/60 bg-amber-50 p-3 flex items-center justify-between flex-wrap gap-2">
                  <p className="text-xs text-amber-900">
                    {isAr ? "أضف مساحة الإعداد الخاصة بك لمعرفة الأكشاك التي تناسب مساحتك." : "Add your setup size to see which booths fit your stand."}
                  </p>
                  <button type="button" onClick={() => setEditingSetupSize(true)} className="text-xs px-3 py-1.5 rounded-[6px] bg-brown text-cream-soft shrink-0">
                    {isAr ? "إضافة المساحة" : "Add Setup Size"}
                  </button>
                </div>
              )}

              {stagedBooths.length > 0 && (
                <StagedBoothsSummary
                  stagedBooths={stagedBooths}
                  totals={combinedTotals(stagedBooths.map((b) => b.code))}
                  busy={busy}
                  canAddMore={multiMode && stagedBooths.length < maxBooths}
                  onRemove={removeStagedBooth}
                  onConfirm={confirmStagedBooths}
                  onChooseDifferent={() => {
                    setStagedBooths([]);
                    setMultiMode(false);
                  }}
                  isAr={isAr}
                  setupWidthMm={view.setupWidthMm}
                  setupDepthMm={view.setupDepthMm}
                />
              )}

              {stagedBooths.length >= maxBooths ? null : floorplan ? (
                <>
                  {floorplan.allowMultipleBooths && stagedBooths.length === 0 && !multiMode && (
                    <button type="button" onClick={() => setMultiMode(true)} className="mb-3 text-sm underline text-brown">
                      {isAr ? "اختيار أكثر من كشك" : "Choose More Than One Booth"}
                    </button>
                  )}
                  <BoothSelector
                    features={floorplan.features}
                    booths={floorplan.booths}
                    tiers={floorplan.tiers}
                    sizeStyles={sizeStyles}
                    backgroundImageUrl={floorplan.floorPlanImageUrl}
                    excludeIds={stagedBooths.map((b) => b.id)}
                    confirmLabel={multiMode ? () => (isAr ? "إضافة هذا الكشك" : "Add This Booth") : undefined}
                    onConfirmBooth={setPendingBooth}
                    onBoothBecameUnavailable={(booth) => {
                      setNotice(
                        isAr
                          ? `أصبح ${booth.code} غير متاح للتو. يرجى اختيار كشك آخر.`
                          : `${booth.code} has just become unavailable. Please choose another booth.`
                      );
                      // Also close the confirm modal if it was open for this exact booth.
                      setPendingBooth((cur) => (cur?.id === booth.id ? null : cur));
                    }}
                  />
                </>
              ) : (
                <p className="text-brown-light text-sm">{isAr ? "جارٍ التحميل…" : "Loading floor plan…"}</p>
              )}
              {pendingBooth && (
                <BoothConfirmModal
                  booth={pendingBooth}
                  tiers={floorplan?.tiers || []}
                  eventName={view.event.name}
                  busy={busy}
                  onConfirm={confirmPendingBooth}
                  onCancel={() => setPendingBooth(null)}
                  setupWidthMm={view.setupWidthMm}
                  setupDepthMm={view.setupDepthMm}
                  onEditSetupSize={() => setEditingSetupSize(true)}
                  mode={multiMode ? "add" : "single"}
                />
              )}
            </div>
          )}

          {hasHold && view.boothHolds[0].holdStage === "REVIEW" && (
            <div className="space-y-5">
              {view.boothHolds.map((h) => {
                const { raw, tier } = boothLine(h.code);
                return <SelectedBoothCard key={h.boothId} code={h.code} sizeLabel={tier?.label} priceAedFils={raw?.priceAedFils ?? h.priceAedFils ?? undefined} eventName={view.event.name} />;
              })}
              {view.boothHolds.length > 1 && (
                <div className="rounded-[10px] border border-brown/10 bg-cream p-4 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-brown-light">{isAr ? "المجموع الفرعي" : "Subtotal"}</span>
                    <span className="text-brown-dark">{formatAed(heldTotals.subtotal)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-brown-light">{isAr ? "ضريبة القيمة المضافة" : "VAT"}</span>
                    <span className="text-brown-dark">{formatAed(heldTotals.vat)}</span>
                  </div>
                  <div className="flex items-center justify-between pt-1.5 mt-1.5 border-t border-brown/10">
                    <span className="text-brown-dark font-medium">{isAr ? "الإجمالي" : "Total"}</span>
                    <span className="text-brown-dark font-semibold">{formatAed(heldTotals.total)}</span>
                  </div>
                </div>
              )}
              <div className="flex gap-3">
                {view.eventTermsRequired && !view.eventTermsAccepted ? (
                  <Link href={`/vendor/applications/${applicationId}/terms`} className="px-6 py-2.5 rounded-full bg-brown text-cream-soft text-sm hover:bg-brown-dark">
                    {isAr ? "مراجعة وقبول شروط الفعالية" : "Review & Accept Event Terms"}
                  </Link>
                ) : (
                  <button onClick={proceedToPayment} disabled={busy} className="px-6 py-2.5 rounded-full bg-brown text-cream-soft text-sm hover:bg-brown-dark disabled:opacity-50">
                    {isAr ? "المتابعة للدفع" : "Continue to Payment"}
                  </button>
                )}
                <button onClick={changeBooth} disabled={busy} className="px-6 py-2.5 rounded-full border border-brown/30 text-sm disabled:opacity-50">
                  {view.boothHolds.length > 1 ? (isAr ? "اختيار أكشاك أخرى" : "Choose different booths") : isAr ? "اختيار كشك آخر" : "Choose a different booth"}
                </button>
              </div>
            </div>
          )}

          {hasHold && view.boothHolds[0].holdStage === "PAYMENT" && (
            <div className="rounded-xl border border-brown/10 bg-cream p-6">
              <h2 className="font-heading text-xl text-brown-dark mb-1">{t("checkout.title")}</h2>
              <p className="text-xs text-brown-light mb-4">{t("checkout.sandboxNotice")}</p>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-brown-light">{view.boothHolds.length > 1 ? (isAr ? "الأكشاك" : "Booths") : isAr ? "الكشك" : "Booth"}</span>
                <span>{formatBoothCodes(holdCodes)}</span>
              </div>
              <div className="flex justify-between text-sm mb-4">
                <span className="text-brown-light">{isAr ? "المبلغ" : "Amount"}</span>
                <span className="text-brown font-medium">{formatAed(checkoutSession?.amountAedFils ?? view.latestPayment?.amountAedFils ?? 0)}</span>
              </div>
              {view.boothHolds[0].holdExpiresAt && (
                <div className="mb-5">
                  <p className="text-sm text-brown-dark">
                    {isAr ? `${formatBoothCodes(holdCodes)} محجوز للدفع` : `${formatBoothCodes(holdCodes)} reserved for payment`}
                  </p>
                  <Countdown target={view.boothHolds[0].holdExpiresAt} variant="mmss" onExpire={refreshStatus} className="font-semibold text-brown-dark text-lg" />
                </div>
              )}
              <div className="flex flex-col gap-3">
                <button onClick={() => pay("SUCCEEDED")} disabled={busy} className="w-full py-3 rounded-full bg-black text-white text-sm font-medium disabled:opacity-50">
                   {t("checkout.payWithApplePay")}
                </button>
                <button onClick={() => pay("SUCCEEDED")} disabled={busy} className="w-full py-3 rounded-full bg-brown text-cream-soft text-sm disabled:opacity-50">
                  {t("checkout.payWithCard")}
                </button>
                {process.env.NODE_ENV !== "production" && (
                  <button onClick={() => pay("FAILED")} disabled={busy} className="w-full py-2 rounded-full border border-red-300 text-red-700 text-xs disabled:opacity-50">
                    {isAr ? "محاكاة فشل الدفع (تجريبي، للتطوير فقط)" : "Simulate a failed payment (dev only)"}
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
            <p className="label-caps mb-4">{isAr ? "مؤكد ومدفوع" : "Confirmed & Paid"}</p>
            <p className="text-xs uppercase tracking-wide text-brown-light mb-1">
              {view.soldBooths.length > 1 ? (isAr ? "أكشاكك" : "Your Booths") : isAr ? "كشكك" : "Your Booth"}
            </p>
            <p className="font-heading text-5xl sm:text-6xl text-brown-dark leading-none tracking-tight">
              {formatBoothCodes(view.soldBooths.map((b) => b.code))}
            </p>
            {(view.receipt || view.soldBooths[0]?.soldAt) && (
              <div className="mt-5 pt-5 border-t border-brown/10 text-sm space-y-1.5">
                {view.receipt && (
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-brown-light">{isAr ? "المبلغ المدفوع" : "Amount Paid"}</span>
                    <span className="text-brown-dark font-medium">{formatAed(view.receipt.totalAedFils)}</span>
                  </div>
                )}
                {view.soldBooths[0]?.soldAt && (
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-brown-light">{isAr ? "تم الدفع في" : "Paid on"}</span>
                    <span className="text-brown-dark">
                      {new Date(view.soldBooths[0].soldAt).toLocaleDateString(isAr ? "ar-AE" : "en-AE", { day: "numeric", month: "long", year: "numeric" })}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* The event-specific vendor group is the highest-priority action on
              this page after seeing the booth itself — deliberately placed
              above the floor plan/receipt so it's never missed. */}
          {view.event.whatsappVendorGroupLink && (
            <div className="rounded-[10px] border border-brown/10 bg-cream p-7 sm:p-8">
              <p className="label-caps mb-2">{isAr ? "مجموعة بائعي الفعالية" : "Event Vendor Group"}</p>
              <p className="text-sm text-brown-light mb-5">
                {isAr
                  ? `انضم إلى مجموعة واتساب الخاصة ببائعي ${view.event.name} لتصلك تعليمات الإعداد وتحديثات البائعين والإعلانات المهمة.`
                  : `Join the private WhatsApp group for ${view.event.name} to receive setup instructions, vendor updates and important event announcements.`}
              </p>
              <a href={view.event.whatsappVendorGroupLink} target="_blank" rel="noreferrer" className="inline-block px-7 py-3 rounded-full bg-brown text-cream-soft text-sm tracking-wide hover:bg-brown-dark transition-colors">
                {isAr ? "انضم إلى مجموعة واتساب" : "Join WhatsApp Group"}
              </a>
            </div>
          )}

          {floorplan && view.soldBooths.length > 0 && (
            <div className="rounded-[10px] border border-brown/10 bg-cream p-5 sm:p-6">
              <div className="flex items-center justify-between mb-4">
                <p className="label-caps">{isAr ? "مخطط الموقع" : "Floor Plan"}</p>
                <button type="button" onClick={() => setMapFocusNonce((n) => n + 1)} className="text-xs underline text-brown">
                  {isAr ? "إعادة ضبط العرض" : "Reset View"}
                </button>
              </div>
              <FloorPlan
                features={floorplan.features}
                booths={floorplan.booths}
                sizeStyles={sizeStyles}
                backgroundImageUrl={floorplan.floorPlanImageUrl}
                interactive
                focusBoothId={view.soldBooths[0]?.boothId ?? null}
                focusNonce={mapFocusNonce}
              />
              <Legend sizeStyles={sizeStyles} showMineKey />
              <div className="mt-4 grid sm:grid-cols-2 gap-4 text-sm">
                {view.soldBooths.map((b) => (
                  <div key={b.boothId} className="rounded-[8px] border border-brown/10 bg-cream-soft p-3">
                    <p className="font-heading text-lg text-brown-dark">{b.code}</p>
                    {b.widthMm != null && b.depthMm != null && (
                      <p className="text-xs text-brown-light">{(b.widthMm / 1000).toLocaleString()} × {(b.depthMm / 1000).toLocaleString()} m</p>
                    )}
                  </div>
                ))}
              </div>
              {view.setupWidthMm != null && view.setupDepthMm != null && (
                <p className="mt-3 text-xs text-brown-light">
                  {isAr ? "مساحة إعدادك" : "Your setup"}: {(view.setupWidthMm / 1000).toLocaleString()} × {(view.setupDepthMm / 1000).toLocaleString()} m
                </p>
              )}
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
              {isAr ? "تنزيل الإيصال" : "Download Receipt"}
            </a>
          )}

          {view.cancellationRequested ? (
            <p className="text-sm text-brown-light">
              {isAr ? "تم إرسال طلب الإلغاء — سيتواصل معك فريقنا." : "Cancellation requested — our team will follow up with you."}
            </p>
          ) : (
            <p className="text-xs text-brown-light">
              {isAr ? "بحاجة للمساعدة بخصوص حجزك؟" : "Need help with your booking?"}{" "}
              <a href="/contact" className="underline">
                {isAr ? "تواصل مع دار الحي" : "Contact DAH"}
              </a>
            </p>
          )}
        </div>
      )}

      {verifyIntent && (
        <PhoneVerifyModal
          onClose={() => setVerifyIntent(null)}
          onVerified={() => {
            const intent = verifyIntent;
            setVerifyIntent(null);
            if (intent === "confirm-booth") confirmPendingBooth();
            else if (intent === "checkout") proceedToPayment();
          }}
        />
      )}

      {editingSetupSize && (
        <SetupSizeModal
          initialWidthMm={view.setupWidthMm}
          initialDepthMm={view.setupDepthMm}
          onCancel={() => setEditingSetupSize(false)}
          onSave={saveSetupSize}
        />
      )}
    </div>
  );
}

function StagedBoothsSummary({
  stagedBooths,
  totals,
  busy,
  canAddMore,
  onRemove,
  onConfirm,
  onChooseDifferent,
  isAr,
  setupWidthMm,
  setupDepthMm,
}: {
  stagedBooths: FloorBooth[];
  totals: { lines: { code: string; price: number | null; sizeLabel: string }[]; subtotal: number; vat: number; total: number };
  busy: boolean;
  canAddMore: boolean;
  onRemove: (id: string) => void;
  onConfirm: () => void;
  onChooseDifferent: () => void;
  isAr: boolean;
  setupWidthMm?: number | null;
  setupDepthMm?: number | null;
}) {
  // Combined-space guidance for a multi-booth selection — never assumes two
  // selected booths automatically combine into one usable space. Only ever
  // claims "Adjacent Booths" when their real mm positions geometrically
  // prove it (isProvablyAdjacent); otherwise, if the vendor's declared
  // setup doesn't fit within any single selected booth alone, this shows a
  // generic "please confirm with DAH" message rather than a false promise
  // or a false denial — see lib/boothFit.ts.
  let combinedSpaceNotice: string | null = null;
  if (stagedBooths.length > 1) {
    const fit = checkMultiBoothFit(
      { widthMm: setupWidthMm ?? null, depthMm: setupDepthMm ?? null },
      stagedBooths.map((b) => ({ widthMm: b.widthMm ?? null, depthMm: b.depthMm ?? null }))
    );
    if (fit.needsCombinedSpaceCaution) {
      const anyAdjacentPair = stagedBooths.some((a, i) => stagedBooths.slice(i + 1).some((b) => isProvablyAdjacent(a, b)));
      combinedSpaceNotice = anyAdjacentPair
        ? isAr
          ? "هذه الأكشاك متجاورة، لكن يجب تأكيد ملاءمة إعدادك للمساحة المجمعة مع دار الحي مباشرة."
          : "These booths are Adjacent Booths, but please confirm your setup fits the combined space directly with DAH."
        : isAr
        ? "يُرجى تأكيد ملاءمة إعدادك مع دار الحي مباشرة — لا يمكننا تأكيد أن هذه الأكشاك تشكل مساحة واحدة متصلة."
        : "Please confirm your setup fits with DAH directly — we can't confirm these booths form one connected space.";
    }
  }

  return (
    <div className="mb-4 rounded-[10px] border border-emerald-700/25 bg-emerald-700/[0.04] p-5">
      <p className="label-caps mb-3 text-emerald-800">{isAr ? "الأكشاك المختارة" : "Your Selected Booths"}</p>
      <div className="space-y-2 mb-4">
        {stagedBooths.map((b, i) => (
          <div key={b.id} className="flex items-center justify-between gap-3 text-sm">
            <div>
              <span className="font-heading text-lg text-brown-dark">{b.code}</span>
              <span className="text-xs text-brown-light ml-2">{totals.lines[i]?.sizeLabel}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-brown-dark font-medium">{totals.lines[i]?.price != null ? formatAed(totals.lines[i].price!) : "—"}</span>
              <button type="button" onClick={() => onRemove(b.id)} className="text-xs underline text-brown-light">
                {isAr ? `إزالة ${b.code}` : `Remove ${b.code}`}
              </button>
            </div>
          </div>
        ))}
      </div>
      {combinedSpaceNotice && (
        <div className="mb-4 rounded-[8px] bg-amber-50 border border-amber-200 text-amber-900 text-xs px-3 py-2.5">
          {combinedSpaceNotice}
        </div>
      )}
      {stagedBooths.length > 1 && (
        <div className="space-y-1 mb-4 text-sm border-t border-brown/10 pt-3">
          <div className="flex items-center justify-between">
            <span className="text-brown-light">{isAr ? "المجموع الفرعي" : "Subtotal"}</span>
            <span className="text-brown-dark">{formatAed(totals.subtotal)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-brown-light">{isAr ? "ضريبة القيمة المضافة" : "VAT"}</span>
            <span className="text-brown-dark">{formatAed(totals.vat)}</span>
          </div>
          <div className="flex items-center justify-between pt-1.5 border-t border-brown/10">
            <span className="text-brown-dark font-medium">{isAr ? "الإجمالي" : "Total"}</span>
            <span className="text-brown-dark font-semibold">{formatAed(totals.total)}</span>
          </div>
        </div>
      )}
      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={onConfirm} disabled={busy} className="px-6 py-2.5 rounded-full bg-brown text-cream-soft text-sm hover:bg-brown-dark disabled:opacity-50">
          {stagedBooths.length > 1 ? (isAr ? "تأكيد الأكشاك" : "Confirm Booths") : isAr ? "تأكيد الكشك" : "Confirm Booth"}
        </button>
        <button type="button" onClick={onChooseDifferent} disabled={busy} className="px-6 py-2.5 rounded-full border border-brown/30 text-sm disabled:opacity-50">
          {isAr ? "اختيار أكشاك مختلفة" : "Choose Different Booths"}
        </button>
      </div>
      {!canAddMore && stagedBooths.length === 0 && null}
    </div>
  );
}
