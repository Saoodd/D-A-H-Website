"use client";

import { formatAed } from "@/lib/constants";
import { useLocale } from "@/lib/i18n/context";
import type { ReceiptData } from "@/lib/receipts";

const PROVIDER_LABEL: Record<string, string> = {
  sandbox: "Card (Sandbox)",
};

/** The inline payment summary shown on the confirmed booking page — the
 *  same authoritative computation as the printable receipt (lib/receipts.ts),
 *  just presented in-page. Deliberately quiet: no bright success colors,
 *  consistent with the rest of the confirmed-booking card. */
export function ReceiptSummaryCard({ receipt }: { receipt: ReceiptData }) {
  const { locale } = useLocale();

  const paidDate = receipt.paidAt
    ? new Date(receipt.paidAt).toLocaleString(locale === "ar" ? "ar-AE" : "en-AE", {
        day: "numeric",
        month: "long",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      })
    : null;

  return (
    <div className="rounded-[10px] border border-brown/10 bg-cream p-7 sm:p-8">
      <p className="label-caps mb-5">{locale === "ar" ? "الإيصال" : "Receipt"}</p>

      <dl className="text-sm space-y-2">
        <Row label={locale === "ar" ? "الفعالية" : "Event"} value={receipt.eventName} />
        <Row label={locale === "ar" ? "النشاط التجاري" : "Business"} value={receipt.businessName} />
        <Row label={locale === "ar" ? "الكشك" : "Booth"} value={receipt.boothCode} />
        <Row label={locale === "ar" ? "مساحة الكشك" : "Booth Size"} value={receipt.boothSizeLabel} />
      </dl>

      <div className="border-t border-brown/10 mt-5 pt-5">
        <dl className="text-sm space-y-2">
          {receipt.vatApplicable && (
            <>
              <Row label={locale === "ar" ? "المجموع الفرعي" : "Subtotal"} value={formatAed(receipt.subtotalAedFils)} />
              <Row label={locale === "ar" ? "ضريبة القيمة المضافة" : "VAT"} value={formatAed(receipt.vatAedFils)} />
            </>
          )}
          <div className="flex items-center justify-between gap-3">
            <span className="text-brown-dark font-medium">{locale === "ar" ? "إجمالي المدفوع" : "Total Paid"}</span>
            <span className="text-brown-dark font-semibold text-base">{formatAed(receipt.totalAedFils)}</span>
          </div>
        </dl>
      </div>

      <div className="border-t border-brown/10 mt-5 pt-5">
        <dl className="text-sm space-y-2">
          <Row label={locale === "ar" ? "حالة الدفع" : "Payment Status"} value={locale === "ar" ? "مدفوع" : "Paid"} />
          {paidDate && <Row label={locale === "ar" ? "تاريخ الدفع" : "Payment Date"} value={paidDate} />}
          {receipt.providerRef && <Row label={locale === "ar" ? "مرجع الدفع" : "Payment Reference"} value={receipt.providerRef} />}
          <Row label={locale === "ar" ? "طريقة الدفع" : "Payment Method"} value={PROVIDER_LABEL[receipt.provider] ?? receipt.provider} />
          {receipt.receiptNumber && <Row label={locale === "ar" ? "رقم الإيصال" : "Receipt Number"} value={receipt.receiptNumber} />}
        </dl>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-brown-light">{label}</span>
      <span className="text-brown-dark text-right">{value}</span>
    </div>
  );
}
