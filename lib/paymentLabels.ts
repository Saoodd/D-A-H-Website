// How a payment was made, as shown on receipts and admin records. Shared by
// server and client components (no server-only imports), so the printable
// receipt and the in-page summary can never label the same payment
// differently.

export const OFFLINE_PAYMENT_METHODS = ["BANK_TRANSFER", "CASH", "CARD_POS", "OTHER"] as const;
export type OfflinePaymentMethod = (typeof OFFLINE_PAYMENT_METHODS)[number];

const METHOD_LABEL: Record<OfflinePaymentMethod, { en: string; ar: string }> = {
  BANK_TRANSFER: { en: "Bank Transfer", ar: "تحويل بنكي" },
  CASH: { en: "Cash", ar: "نقداً" },
  CARD_POS: { en: "Card (in person)", ar: "بطاقة (حضورياً)" },
  OTHER: { en: "Other", ar: "أخرى" },
};

const PROVIDER_LABEL: Record<string, { en: string; ar: string }> = {
  sandbox: { en: "Card (Sandbox)", ar: "بطاقة (تجريبي)" },
};

export function paymentMethodLabel(
  payment: { provider: string; method?: string | null },
  locale: "en" | "ar" = "en"
): string {
  if (payment.provider === "offline") {
    const m = METHOD_LABEL[payment.method as OfflinePaymentMethod];
    return m ? m[locale] : locale === "ar" ? "دفع مباشر" : "Offline payment";
  }
  return PROVIDER_LABEL[payment.provider]?.[locale] ?? payment.provider;
}
