"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale } from "@/lib/i18n/context";

export function EventTermsClient({
  applicationId,
  eventName,
  title,
  version,
  bodyHtml,
}: {
  applicationId: string;
  eventName: string;
  title: string;
  version: number;
  bodyHtml: string;
}) {
  const { locale } = useLocale();
  const router = useRouter();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrolledToBottom, setScrolledToBottom] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [representativeName, setRepresentativeName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function checkScrolled() {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
    if (atBottom) setScrolledToBottom(true);
  }

  useEffect(() => {
    // Short content that never needs scrolling shouldn't trap the vendor —
    // check once on mount whether there's anything to scroll through at all.
    checkScrolled();
  }, []);

  const canAccept = scrolledToBottom && agreed && representativeName.trim().length >= 2;

  async function acceptAndContinue() {
    if (!canAccept) return;
    setBusy(true);
    setError(null);
    try {
      const acceptRes = await fetch(`/api/applications/${applicationId}/event-terms`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ representativeName: representativeName.trim() }),
      });
      const acceptData = await acceptRes.json().catch(() => ({}));
      if (!acceptRes.ok) throw new Error(acceptData.error || "Could not record your acceptance");

      const startRes = await fetch(`/api/checkout/${applicationId}/start`, { method: "POST" });
      if (!startRes.ok) {
        const startData = await startRes.json().catch(() => ({}));
        throw new Error(startData.error || "Could not continue to payment");
      }

      router.push(`/vendor/applications/${applicationId}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setBusy(false);
    }
  }

  return (
    <div className="container-page py-16 max-w-2xl">
      <Link href={`/vendor/applications/${applicationId}`} className="text-sm text-brown-light underline">
        &larr; {locale === "ar" ? "العودة إلى الطلب" : "Back to application"}
      </Link>

      <h1 className="font-heading text-2xl md:text-3xl text-brown-dark mt-4">{eventName}</h1>
      <p className="text-brown-light mb-6">{title}</p>

      <div
        ref={scrollRef}
        onScroll={checkScrolled}
        className="max-h-[50vh] overflow-y-auto rounded-xl border border-brown/15 bg-cream p-6 prose prose-sm max-w-none"
      >
        <div dangerouslySetInnerHTML={{ __html: bodyHtml }} />
      </div>
      {!scrolledToBottom && (
        <p className="text-xs text-brown-light mt-2">
          {locale === "ar" ? "يرجى التمرير حتى نهاية الاتفاقية لمتابعة القبول." : "Scroll to the end of the agreement to continue."}
        </p>
      )}

      <div className="mt-8 space-y-5">
        <label className="flex flex-col gap-1 text-sm max-w-sm">
          {locale === "ar" ? "اسم الممثل المفوض" : "Name of Authorized Representative"}
          <input
            value={representativeName}
            onChange={(e) => setRepresentativeName(e.target.value)}
            disabled={!scrolledToBottom}
            className="border border-brown/20 rounded-lg px-3 py-2 bg-cream-soft disabled:opacity-50"
          />
        </label>

        <label className="flex items-start gap-2.5 text-sm">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            disabled={!scrolledToBottom}
            className="mt-0.5"
          />
          <span className="text-brown-light">
            {locale === "ar"
              ? `لقد قرأت وأوافق على الشروط والأحكام الخاصة بفعالية ${eventName} (الإصدار ${version}).`
              : `I have read and agree to the Terms & Conditions for ${eventName} (v${version}).`}
          </span>
        </label>

        {error && <p className="text-sm text-red-700">{error}</p>}

        <button
          onClick={acceptAndContinue}
          disabled={!canAccept || busy}
          className="px-7 py-3 rounded-full bg-brown text-cream-soft text-sm tracking-wide hover:bg-brown-dark transition-colors disabled:opacity-40"
        >
          {busy ? "…" : locale === "ar" ? "الموافقة والمتابعة للدفع" : "Accept & Continue to Payment"}
        </button>
      </div>
    </div>
  );
}
