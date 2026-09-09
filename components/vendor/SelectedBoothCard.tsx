"use client";

import { formatAed } from "@/lib/constants";
import { Countdown } from "@/components/Countdown";
import { useLocale } from "@/lib/i18n/context";

// The premium "this is one of the main moments of booking" treatment for a
// held booth — deliberately understated (no bright colors, no heavy
// shadows): a large booth code is the hierarchy anchor, everything else is
// quiet supporting detail.
export function SelectedBoothCard({
  code,
  sizeLabel,
  priceAedFils,
  eventName,
  holdExpiresAt,
  onCountdownExpire,
}: {
  code: string;
  sizeLabel?: string | null;
  priceAedFils?: number | null;
  eventName: string;
  holdExpiresAt?: string | null;
  onCountdownExpire?: () => void;
}) {
  const { locale } = useLocale();

  return (
    <div className="rounded-[10px] border border-brown/10 bg-cream p-7 sm:p-8">
      <p className="label-caps mb-4">{locale === "ar" ? "الكشك المختار" : "Your Selected Booth"}</p>
      <p className="font-heading text-5xl sm:text-6xl text-brown-dark leading-none tracking-tight">{code}</p>
      <div className="mt-4 space-y-1 text-sm text-brown-light">
        {sizeLabel && <p>{sizeLabel}</p>}
        {priceAedFils != null && <p className="text-brown-dark font-medium">{formatAed(priceAedFils)}</p>}
        <p>{eventName}</p>
      </div>
      {holdExpiresAt && (
        <p className="mt-5 pt-5 border-t border-brown/10 text-sm text-brown-light">
          {locale === "ar" ? "احجز خلال" : "Hold expires in"}{" "}
          <Countdown target={holdExpiresAt} onExpire={onCountdownExpire} className="text-brown-dark font-medium" />
        </p>
      )}
    </div>
  );
}
