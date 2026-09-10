"use client";

import Link from "next/link";
import { useLocale } from "@/lib/i18n/context";
import { formatAed } from "@/lib/constants";
import { EmptyState } from "@/components/ui/Card";

interface PaymentRow {
  paymentId: string;
  applicationId: string;
  eventName: string;
  boothCode: string;
  boothSize: string;
  amountAedFils: number;
  paidAt: string | null;
}

export function PaymentsClient({ payments }: { payments: PaymentRow[] }) {
  const { t, locale } = useLocale();
  const dateFmt = (iso: string) => new Date(iso).toLocaleDateString(locale === "ar" ? "ar-AE" : "en-AE");

  return (
    <div className="max-w-2xl">
      <h1 className="font-heading text-2xl text-brown-dark mb-1">{locale === "ar" ? "المدفوعات" : "Payments"}</h1>
      <p className="text-sm text-brown-light mb-8">
        {locale === "ar"
          ? "كل دفعة ناجحة قمت بها لدى دار الحي، مع الوصول إلى إيصالها في أي وقت."
          : "Every successful payment you've made with Dar Al Hay, with access to its receipt at any time."}
      </p>

      {payments.length === 0 ? (
        <EmptyState title={t("vendorOverview.paymentsEmpty")} />
      ) : (
        <div className="space-y-3">
          {payments.map((p) => (
            <div key={p.applicationId} className="rounded-[10px] border border-brown/10 bg-cream p-5">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <p className="font-heading text-brown-dark">{p.eventName}</p>
                  <p className="text-xs text-brown-light mt-1">
                    {t("vendorPayments.booth")} {p.boothCode} ({p.boothSize})
                    {p.paidAt ? ` · ${t("vendorPayments.paidOn")} ${dateFmt(p.paidAt)}` : ""}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-heading text-brown">{formatAed(p.amountAedFils)}</p>
                  <div className="flex items-center gap-3 justify-end mt-0.5">
                    <Link href={`/vendor/applications/${p.applicationId}`} className="text-xs underline text-brown-light">
                      {t("vendorPayments.viewApplication")}
                    </Link>
                    <a href={`/vendor/receipts/${p.paymentId}`} target="_blank" rel="noreferrer" className="text-xs underline text-brown-light">
                      {locale === "ar" ? "الإيصال" : "Receipt"}
                    </a>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
