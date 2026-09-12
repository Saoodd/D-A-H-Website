"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale } from "@/lib/i18n/context";
import { Button } from "@/components/ui/Button";

type Step = "loading" | "send" | "code" | "change" | "success";

const COUNTRY_CODES = [
  { code: "+971", label: "🇦🇪 +971" },
  { code: "+966", label: "🇸🇦 +966" },
  { code: "+974", label: "🇶🇦 +974" },
  { code: "+973", label: "🇧🇭 +973" },
  { code: "+965", label: "🇰🇼 +965" },
  { code: "+968", label: "🇴🇲 +968" },
  { code: "+20", label: "🇪🇬 +20" },
  { code: "+91", label: "🇮🇳 +91" },
  { code: "+92", label: "🇵🇰 +92" },
  { code: "+63", label: "🇵🇭 +63" },
  { code: "+44", label: "🇬🇧 +44" },
  { code: "+1", label: "🇺🇸/🇨🇦 +1" },
];

function CheckIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

/** A self-contained phone-verification flow, shown as a modal wherever an
 *  action requires a verified phone (apply, select booth, accept terms,
 *  pay). Drives itself through PhoneField-style state: fetch the current
 *  masked number, send a code, collect + check it, and on success calls
 *  `onVerified()` so the caller can resume whatever action opened it —
 *  never sends the vendor away to find their place again. */
export function PhoneVerifyModal({ onVerified, onClose }: { onVerified: () => void; onClose: () => void }) {
  const { locale } = useLocale();
  const isAr = locale === "ar";

  const [step, setStep] = useState<Step>("loading");
  const [phoneMasked, setPhoneMasked] = useState("");
  const [phoneUsable, setPhoneUsable] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [code, setCode] = useState("");

  // "Change phone number" sub-state
  const [countryCode, setCountryCode] = useState("+971");
  const [numberDraft, setNumberDraft] = useState("");
  const [changeBusy, setChangeBusy] = useState(false);
  const [changeError, setChangeError] = useState<string | null>(null);

  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/vendor/phone-verification/status");
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (res.ok && data.phoneVerified) {
          onVerified();
          return;
        }
        setPhoneMasked(data.phoneMasked || "");
        setStep("send");
      } catch {
        if (!cancelled) setStep("send");
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetch once on open
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  async function sendCode() {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch("/api/vendor/phone-verification/send", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.code !== "SENT") {
        // Never advance to the code-entry step and never start a resend
        // countdown unless the SMS provider actually accepted the request —
        // a failed send (bad number, provider outage, our own abuse cap)
        // must never look like "a code is on its way".
        const invalidNumber = data.code === "PHONE_INVALID" || data.code === "INVALID_NUMBER";
        setPhoneUsable(!invalidNumber);
        // Only a genuine RATE_LIMITED response with a real countdown starts
        // the timer — every other failure leaves Send Code immediately
        // retryable, with a plain error message instead of a fake wait.
        setCooldown(data.code === "RATE_LIMITED" && data.retryAfterSeconds ? data.retryAfterSeconds : 0);
        setNotice(data.error || (isAr ? "تعذر إرسال الرمز" : "Couldn't send a code — please try again."));
        return;
      }
      if (data.phoneMasked) setPhoneMasked(data.phoneMasked);
      setCooldown(data.cooldownSeconds || 45);
      setCode("");
      setStep("code");
    } catch {
      // A network-level failure (fetch itself threw) is exactly the same
      // "nothing was sent" case — never fake progress here either.
      setCooldown(0);
      setNotice(isAr ? "تعذر إرسال الرمز" : "Couldn't send a code — please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch("/api/vendor/phone-verification/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNotice(data.error || (isAr ? "الرمز غير صحيح" : "That code isn't correct."));
        return;
      }
      setStep("success");
      setTimeout(() => onVerified(), 900);
    } finally {
      setBusy(false);
    }
  }

  async function saveNewNumber() {
    if (!numberDraft.trim()) {
      setChangeError(isAr ? "يرجى إدخال رقم الجوال." : "Please enter your mobile number.");
      return;
    }
    setChangeBusy(true);
    setChangeError(null);
    try {
      const res = await fetch("/api/vendor/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: `${countryCode} ${numberDraft.trim()}` }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setChangeError(data.error || (isAr ? "تعذر حفظ الرقم" : "Couldn't save that number."));
        return;
      }
      setPhoneUsable(true);
      setNotice(null);
      setCooldown(0);
      // Re-fetch the fresh masked number, then go straight to sending a
      // code to it — that's the whole point of changing it mid-flow.
      const statusRes = await fetch("/api/vendor/phone-verification/status");
      const statusData = await statusRes.json().catch(() => ({}));
      setPhoneMasked(statusData.phoneMasked || "");
      setStep("send");
    } finally {
      setChangeBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink/40 px-0 sm:px-4"
      role="dialog"
      aria-modal="true"
      aria-label={isAr ? "التحقق من رقم الجوال" : "Verify phone number"}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div ref={dialogRef} className="w-full sm:max-w-sm rounded-t-2xl sm:rounded-[10px] bg-cream border border-brown/10 p-6 sm:p-7">
        {step === "loading" && (
          <div className="py-8 text-center text-sm text-brown-light">{isAr ? "جارٍ التحميل…" : "Loading…"}</div>
        )}

        {step === "send" && (
          <>
            <p className="label-caps mb-1">{isAr ? "التحقق من الجوال" : "Verify Phone"}</p>
            <h2 className="font-heading text-2xl text-brown-dark mb-2">{isAr ? "تحقق من رقم جوالك" : "Verify your phone number"}</h2>
            <p className="text-sm text-brown-light mb-5">
              {isAr ? "سنرسل رمز تحقق إلى:" : "We'll send a verification code to:"}
              <br />
              <span className="text-brown-dark font-medium">{phoneMasked}</span>
            </p>
            {!phoneUsable && (
              <p className="text-xs text-red-700 dark:text-red-400 mb-3">
                {isAr ? "يرجى تحديث رقم جوالك أولاً." : "Please update your mobile number first."}
              </p>
            )}
            {notice && <p className="text-xs text-brown-light mb-3">{notice}</p>}
            <div className="flex flex-col gap-3">
              <Button onClick={sendCode} loading={busy} size="lg" className="w-full" disabled={!phoneUsable || cooldown > 0}>
                {cooldown > 0 ? (isAr ? `أعد المحاولة خلال ${cooldown} ثانية` : `Retry in ${cooldown}s`) : isAr ? "إرسال الرمز" : "Send Code"}
              </Button>
              <button type="button" onClick={() => setStep("change")} className="text-xs text-brown underline self-center">
                {isAr ? "تغيير رقم الجوال" : "Change phone number"}
              </button>
              <button type="button" onClick={onClose} className="text-xs text-brown-light self-center">
                {isAr ? "إلغاء" : "Cancel"}
              </button>
            </div>
          </>
        )}

        {step === "code" && (
          <form onSubmit={verifyCode}>
            <p className="label-caps mb-1">{isAr ? "التحقق من الجوال" : "Verify Phone"}</p>
            <h2 className="font-heading text-2xl text-brown-dark mb-2">{isAr ? "أدخل رمز التحقق" : "Enter verification code"}</h2>
            <p className="text-sm text-brown-light mb-5">
              {isAr ? `أرسلنا رمزاً إلى ${phoneMasked}` : `We sent a code to ${phoneMasked}`}
            </p>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 8))}
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              placeholder="000000"
              className="w-full border border-brown/20 rounded-lg px-3 py-3 bg-cream-soft tracking-[0.4em] text-center text-lg mb-4"
            />
            {notice && <p className="text-xs text-red-700 dark:text-red-400 mb-4">{notice}</p>}
            <div className="flex flex-col gap-3">
              <Button type="submit" loading={busy} size="lg" className="w-full" disabled={!code.trim()}>
                {isAr ? "تحقق" : "Verify"}
              </Button>
              <div className="flex items-center justify-center gap-4 text-xs">
                {cooldown > 0 ? (
                  <span className="text-brown-light">{isAr ? `إعادة الإرسال خلال ${cooldown} ثانية` : `Resend code in ${cooldown}s`}</span>
                ) : (
                  <button type="button" onClick={sendCode} disabled={busy} className="text-brown underline">
                    {isAr ? "إعادة إرسال الرمز" : "Resend code"}
                  </button>
                )}
                <span className="text-brown-light/40">·</span>
                <button type="button" onClick={() => setStep("change")} className="text-brown underline">
                  {isAr ? "تغيير الرقم" : "Change number"}
                </button>
              </div>
              <button type="button" onClick={onClose} className="text-xs text-brown-light self-center">
                {isAr ? "إلغاء" : "Cancel"}
              </button>
            </div>
          </form>
        )}

        {step === "change" && (
          <>
            <p className="label-caps mb-1">{isAr ? "التحقق من الجوال" : "Verify Phone"}</p>
            <h2 className="font-heading text-2xl text-brown-dark mb-4">{isAr ? "تحديث رقم الجوال" : "Update your mobile number"}</h2>
            <div className="flex gap-2 mb-4">
              <select
                value={countryCode}
                onChange={(e) => setCountryCode(e.target.value)}
                aria-label="Country code"
                className="border border-brown/20 rounded-lg px-2 py-2 bg-cream-soft w-[110px] shrink-0"
              >
                {COUNTRY_CODES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.label}
                  </option>
                ))}
              </select>
              <input
                value={numberDraft}
                onChange={(e) => setNumberDraft(e.target.value)}
                type="tel"
                placeholder="50 123 4567"
                autoFocus
                className="border border-brown/20 rounded-lg px-3 py-2 bg-cream-soft flex-1 min-w-0"
              />
            </div>
            {changeError && <p className="text-xs text-red-700 dark:text-red-400 mb-4">{changeError}</p>}
            <div className="flex flex-col gap-3">
              <Button onClick={saveNewNumber} loading={changeBusy} size="lg" className="w-full">
                {isAr ? "حفظ ومتابعة" : "Save & Continue"}
              </Button>
              <button type="button" onClick={() => setStep("send")} className="text-xs text-brown-light self-center">
                {isAr ? "رجوع" : "Back"}
              </button>
            </div>
          </>
        )}

        {step === "success" && (
          <div className="py-6 flex flex-col items-center text-center gap-3">
            <span className="text-emerald-700 dark:text-emerald-400">
              <CheckIcon />
            </span>
            <p className="font-heading text-xl text-brown-dark">{isAr ? "تم التحقق من رقم جوالك" : "Phone verified"}</p>
          </div>
        )}
      </div>
    </div>
  );
}
