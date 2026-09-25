"use client";

import { useEffect, useState } from "react";
import { useLocale } from "@/lib/i18n/context";
import { LinkButton } from "@/components/ui/Button";
import { formatAed } from "@/lib/constants";
import type { LifecycleStatus } from "@/lib/paymentLifecycle";

interface View {
  id: string;
  applicationId: string;
  lifecycle: LifecycleStatus;
  needsAttention: boolean;
  amountAedFils: number;
  receiptNumber: string | null;
}

const OPEN: LifecycleStatus[] = ["CREATED", "PENDING", "AUTHORIZED"];
const POLL_MS = 3000;
const GIVE_UP_MS = 2 * 60 * 1000;

export function PaymentReturnClient({ initial, cancelledHint }: { initial: View; cancelledHint: boolean }) {
  const { locale } = useLocale();
  const isAr = locale === "ar";
  const [view, setView] = useState(initial);
  const [timedOut, setTimedOut] = useState(false);
  const open = OPEN.includes(view.lifecycle) && !view.needsAttention;

  useEffect(() => {
    if (!open) return;
    const started = Date.now();
    const id = setInterval(async () => {
      if (Date.now() - started > GIVE_UP_MS) {
        setTimedOut(true);
        clearInterval(id);
        return;
      }
      const res = await fetch(`/api/payments/${view.id}/status`, { cache: "no-store" });
      if (res.ok) setView(await res.json());
    }, POLL_MS);
    return () => clearInterval(id);
  }, [open, view.id]);

  const booking = `/vendor/applications/${view.applicationId}`;
  const paid = view.lifecycle === "PAID" || view.lifecycle === "PARTIALLY_REFUNDED" || view.lifecycle === "REFUNDED";

  let eyebrow: string, title: string, body: string;
  if (view.needsAttention) {
    eyebrow = isAr ? "قيد المراجعة" : "Under review";
    title = isAr ? "نحتاج إلى التحقق من دفعتك" : "We need to check your payment";
    body = isAr
      ? "وصلتنا معلومات عن دفعتك ويحتاج فريق دار الحي إلى مراجعتها. لن يتم خصم أي مبلغ مرتين، وسنتواصل معك قريباً."
      : "We've received an update about your payment that DAH needs to review. You won't be charged twice. We'll be in touch shortly.";
  } else if (paid) {
    eyebrow = isAr ? "تم الدفع" : "Payment received";
    title = isAr ? "تم تأكيد حجزك" : "Your booking is confirmed";
    body = isAr ? `استلمنا ${formatAed(view.amountAedFils)}. ستجد الإيصال في صفحة حجزك.` : `We received ${formatAed(view.amountAedFils)}. Your receipt is on your booking page.`;
  } else if (view.lifecycle === "FAILED") {
    eyebrow = isAr ? "لم يكتمل الدفع" : "Payment not completed";
    title = isAr ? "لم تتم عملية الدفع" : "Your payment didn't go through";
    body = isAr ? "لم يتم خصم أي مبلغ. يمكنك المحاولة مرة أخرى من صفحة حجزك ما دام الكشك محجوزاً لك." : "No money was taken. You can try again from your booking page while your booth is still held.";
  } else if (view.lifecycle === "CANCELLED" || (cancelledHint && open)) {
    eyebrow = isAr ? "تم الإلغاء" : "Cancelled";
    title = isAr ? "تم إلغاء الدفع" : "Payment cancelled";
    body = isAr ? "لم يتم خصم أي مبلغ. يمكنك العودة إلى حجزك والمحاولة مرة أخرى." : "No money was taken. You can return to your booking and try again.";
  } else if (timedOut) {
    eyebrow = isAr ? "قيد المعالجة" : "Still processing";
    title = isAr ? "ما زلنا ننتظر تأكيد مزود الدفع" : "We're still waiting for the payment provider";
    body = isAr ? "سيتم تحديث حجزك تلقائياً فور وصول التأكيد. لا تدفع مرة أخرى." : "Your booking will update automatically as soon as confirmation arrives. Please don't pay again.";
  } else {
    eyebrow = isAr ? "جارٍ التأكيد" : "Confirming";
    title = isAr ? "جارٍ تأكيد دفعتك…" : "Confirming your payment…";
    body = isAr ? "يستغرق ذلك عادة بضع ثوانٍ. لا تغلق هذه الصفحة ولا تدفع مرة أخرى." : "This usually takes a few seconds. Please keep this page open and don't pay again.";
  }

  return (
    <div className="container-page py-20 max-w-xl">
      <div className="rounded-xl border border-brown/15 bg-cream p-7 md:p-9" role="status" aria-live="polite">
        <p className="label-caps mb-3">{eyebrow}</p>
        <h1 className="font-heading text-2xl md:text-3xl text-brown-dark">{title}</h1>
        <p className="mt-3 text-sm text-brown-light leading-relaxed">{body}</p>
        {open && !timedOut && !view.needsAttention && (
          <div className="mt-6 h-1 w-full overflow-hidden rounded-full bg-brown/10">
            <div className="h-full w-1/3 animate-pulse rounded-full bg-brown/40" />
          </div>
        )}
        <div className="mt-7 flex flex-wrap gap-3">
          <LinkButton href={booking}>{isAr ? "عرض الحجز" : "View booking"}</LinkButton>
          {paid && view.receiptNumber && (
            <LinkButton href={`/vendor/receipts/${view.id}`} variant="secondary">
              {isAr ? "الإيصال" : "Receipt"} {view.receiptNumber}
            </LinkButton>
          )}
        </div>
      </div>
    </div>
  );
}
