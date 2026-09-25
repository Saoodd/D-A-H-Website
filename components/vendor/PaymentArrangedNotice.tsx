"use client";

import Link from "next/link";
import { useLocale } from "@/lib/i18n/context";

/** Shown instead of the online checkout while the site has no live payment
 *  gateway (lib/paymentMode.ts, mode DISABLED). The booth stays reserved in
 *  its review hold; DAH collects payment directly and confirms the booking
 *  from the admin panel, at which point this page moves on to the normal
 *  Confirmed & Paid view with the receipt. */
export function PaymentArrangedNotice({ acceptanceExpiresAt }: { acceptanceExpiresAt: string | null }) {
  const { locale } = useLocale();
  const isAr = locale === "ar";
  const deadline = acceptanceExpiresAt
    ? new Date(acceptanceExpiresAt).toLocaleString(isAr ? "ar-AE" : "en-AE", {
        day: "numeric",
        month: "long",
        hour: "numeric",
        minute: "2-digit",
      })
    : null;

  return (
    <div className="rounded-xl border border-brown/15 bg-cream p-5 md:p-6" role="status">
      <p className="label-caps mb-2">{isAr ? "تم حجز الكشك" : "Booth Reserved"}</p>
      <p className="font-heading text-xl text-brown-dark">
        {isAr ? "سيتواصل معك فريق دار الحي لترتيب الدفع" : "DAH will contact you to arrange payment"}
      </p>
      <p className="mt-2 text-sm text-brown-light leading-relaxed">
        {isAr
          ? "الدفع الإلكتروني غير متاح بعد. سنرسل لك تفاصيل الدفع عبر واتساب أو البريد الإلكتروني. بمجرد استلام الدفعة يتم تأكيد حجزك وتظهر الإيصال هنا."
          : "Online payment isn't available yet. We'll send you payment details by WhatsApp or email. As soon as your payment is received, your booking is confirmed and your receipt appears here."}
      </p>
      {deadline && (
        <p className="mt-3 text-sm text-brown-dark">
          {isAr ? `الكشك محجوز لك حتى ${deadline}.` : `Your booth is held for you until ${deadline}.`}
        </p>
      )}
      <p className="mt-3 text-sm">
        <Link href="/contact" className="text-brown underline underline-offset-2 hover:text-brown-dark">
          {isAr ? "تواصل مع دار الحي" : "Contact DAH"}
        </Link>
      </p>
    </div>
  );
}
