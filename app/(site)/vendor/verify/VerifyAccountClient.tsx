"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/lib/i18n/context";
import { Button } from "@/components/ui/Button";

type Status = "required" | "sent" | "verified";

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function StatusLine({ status, labels }: { status: Status; labels: { required: string; sent: string; verified: string } }) {
  if (status === "verified") {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm text-emerald-700 dark:text-emerald-400 font-medium">
        <CheckIcon />
        {labels.verified}
      </span>
    );
  }
  return <span className="text-sm text-brown-light">{status === "sent" ? labels.sent : labels.required}</span>;
}

export function VerifyAccountClient({
  businessName,
  email,
  emailVerified: initialEmailVerified,
  emailAlreadySent,
  phoneMasked,
  phoneVerified: initialPhoneVerified,
  phoneUsable,
}: {
  businessName: string;
  email: string;
  emailVerified: boolean;
  emailAlreadySent: boolean;
  phoneMasked: string;
  phoneVerified: boolean;
  phoneUsable: boolean;
}) {
  const { locale } = useLocale();
  const router = useRouter();
  const isAr = locale === "ar";

  const [emailVerified, setEmailVerified] = useState(initialEmailVerified);
  const [phoneVerified, setPhoneVerified] = useState(initialPhoneVerified);

  const [emailStatus, setEmailStatus] = useState<Status>(initialEmailVerified ? "verified" : emailAlreadySent ? "sent" : "required");
  const [emailCooldown, setEmailCooldown] = useState(0);
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailNotice, setEmailNotice] = useState<string | null>(null);

  const [phoneStatus, setPhoneStatus] = useState<Status>(initialPhoneVerified ? "verified" : "required");
  const [phoneCooldown, setPhoneCooldown] = useState(0);
  const [phoneBusy, setPhoneBusy] = useState(false);
  const [phoneNotice, setPhoneNotice] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [checkBusy, setCheckBusy] = useState(false);

  // Countdown timers for the resend cooldowns.
  useEffect(() => {
    if (emailCooldown <= 0) return;
    const t = setInterval(() => setEmailCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [emailCooldown]);
  useEffect(() => {
    if (phoneCooldown <= 0) return;
    const t = setInterval(() => setPhoneCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [phoneCooldown]);

  // Lightweight polling so verifying the email link in another tab updates
  // this page automatically — stops the moment both are verified.
  const bothVerified = emailVerified && phoneVerified;
  useEffect(() => {
    if (bothVerified) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch("/api/vendor/email-verification/status");
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (cancelled) return;
        if (data.emailVerified && emailStatus !== "verified") {
          setEmailVerified(true);
          setEmailStatus("verified");
        }
        if (data.phoneVerified && phoneStatus !== "verified") {
          setPhoneVerified(true);
          setPhoneStatus("verified");
        }
      } catch {
        // Silent — a missed poll just tries again next interval.
      }
    };
    const interval = setInterval(poll, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-arm when verification state itself changes
  }, [bothVerified]);

  async function logout() {
    await fetch("/api/vendor/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  async function sendEmailVerification() {
    setEmailBusy(true);
    setEmailNotice(null);
    try {
      const res = await fetch("/api/vendor/email-verification/send", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.retryAfterSeconds) setEmailCooldown(data.retryAfterSeconds);
        setEmailNotice(data.error || (isAr ? "تعذر الإرسال" : "Couldn't send that — please try again."));
        return;
      }
      setEmailStatus("sent");
      setEmailCooldown(data.cooldownSeconds || 45);
      setEmailNotice(isAr ? "تم إرسال بريد التحقق" : "Verification email sent.");
    } finally {
      setEmailBusy(false);
    }
  }

  async function sendPhoneCode() {
    setPhoneBusy(true);
    setPhoneNotice(null);
    try {
      const res = await fetch("/api/vendor/phone-verification/send", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.retryAfterSeconds) setPhoneCooldown(data.retryAfterSeconds);
        setPhoneNotice(data.error || (isAr ? "تعذر إرسال الرمز" : "Couldn't send a code — please try again."));
        return;
      }
      setPhoneStatus("sent");
      setPhoneCooldown(data.cooldownSeconds || 45);
    } finally {
      setPhoneBusy(false);
    }
  }

  async function checkPhoneCode(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    setCheckBusy(true);
    setPhoneNotice(null);
    try {
      const res = await fetch("/api/vendor/phone-verification/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPhoneNotice(data.error || (isAr ? "الرمز غير صحيح" : "That code isn't correct."));
        return;
      }
      setPhoneVerified(true);
      setPhoneStatus("verified");
      setCode("");
    } finally {
      setCheckBusy(false);
    }
  }

  const emailLabels = {
    required: isAr ? "التحقق مطلوب" : "Verification Required",
    sent: isAr ? "تم إرسال بريد التحقق" : "Verification Sent",
    verified: isAr ? "تم التحقق" : "Verified",
  };
  const phoneLabels = {
    required: isAr ? "التحقق مطلوب" : "Verification Required",
    sent: isAr ? "تم إرسال الرمز" : "Code Sent",
    verified: isAr ? "تم التحقق" : "Verified",
  };

  return (
    <div className="container-page py-14 md:py-20 max-w-xl">
      <div className="flex items-center justify-end mb-6">
        <button onClick={logout} className="text-sm text-brown-light underline">
          {isAr ? "تسجيل الخروج" : "Log out"}
        </button>
      </div>

      <header className="mb-10">
        <h1 className="font-heading text-2xl md:text-3xl text-brown-dark">{isAr ? "تحقق من حسابك" : "Verify Your Account"}</h1>
        <p className="mt-2 text-sm text-brown-light">
          {isAr
            ? "يجب التحقق من بيانات التواصل الخاصة بك قبل أن تتمكن من التقديم لفعاليات دار الحي."
            : "Your contact details must be verified before you can apply to DAH events."}
        </p>
      </header>

      <div className="space-y-4">
        {/* EMAIL */}
        <section className="rounded-[10px] border border-brown/10 bg-cream p-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <p className="label-caps mb-1">{isAr ? "البريد الإلكتروني" : "Email"}</p>
              <p className="text-brown-dark">{email}</p>
              <div className="mt-2">
                <StatusLine status={emailStatus} labels={emailLabels} />
              </div>
            </div>
            {emailStatus !== "verified" && (
              <div className="flex flex-col items-end gap-1">
                <Button size="sm" variant="secondary" onClick={sendEmailVerification} loading={emailBusy} disabled={emailCooldown > 0}>
                  {emailStatus === "sent" ? (isAr ? "إعادة إرسال بريد التحقق" : "Resend Verification Email") : isAr ? "إرسال بريد التحقق" : "Send Verification Email"}
                </Button>
                {emailCooldown > 0 && (
                  <span className="text-xs text-brown-light">
                    {isAr ? `إعادة الإرسال متاحة خلال ${emailCooldown} ثانية` : `Resend available in ${emailCooldown}s`}
                  </span>
                )}
              </div>
            )}
          </div>
          {emailNotice && <p className="mt-3 text-xs text-brown-light">{emailNotice}</p>}
        </section>

        {/* MOBILE */}
        <section className="rounded-[10px] border border-brown/10 bg-cream p-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <p className="label-caps mb-1">{isAr ? "رقم الجوال" : "Mobile"}</p>
              <p className="text-brown-dark">{phoneMasked}</p>
              <div className="mt-2">
                <StatusLine status={phoneStatus} labels={phoneLabels} />
              </div>
            </div>
            {phoneStatus === "required" && phoneUsable && (
              <div className="flex flex-col items-end gap-1">
                <Button size="sm" variant="secondary" onClick={sendPhoneCode} loading={phoneBusy} disabled={phoneCooldown > 0}>
                  {isAr ? "إرسال رمز عبر الرسائل" : "Send SMS Code"}
                </Button>
              </div>
            )}
          </div>

          {!phoneUsable && phoneStatus !== "verified" && (
            <p className="mt-3 text-xs text-brown-light">
              {isAr ? "يرجى تحديث رقم جوالك في الملف الشخصي أولاً." : "Please update your mobile number in "}
              {!isAr && (
                <a href="/vendor/profile" className="underline text-brown">
                  Profile
                </a>
              )}
              {!isAr && " first."}
            </p>
          )}

          {phoneStatus === "sent" && (
            <form onSubmit={checkPhoneCode} className="mt-4 pt-4 border-t border-brown/10 flex flex-col gap-3">
              <p className="text-xs uppercase tracking-widest text-brown-light">{isAr ? "أدخل رمز التحقق" : "Enter Verification Code"}</p>
              <p className="text-xs text-brown-light -mt-1">
                {isAr ? `أرسلنا رمزاً إلى ${phoneMasked}` : `We sent a code to ${phoneMasked}`}
              </p>
              <div className="flex items-center gap-3 flex-wrap">
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 8))}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="000000"
                  className="border border-brown/20 rounded-lg px-3 py-2 bg-cream-soft w-32 tracking-[0.3em] text-center"
                />
                <Button type="submit" size="sm" loading={checkBusy} disabled={!code.trim()}>
                  {isAr ? "تحقق من الرقم" : "Verify Mobile"}
                </Button>
              </div>
              <div>
                {phoneCooldown > 0 ? (
                  <span className="text-xs text-brown-light">{isAr ? `إعادة الإرسال خلال ${phoneCooldown} ثانية` : `Resend code in ${phoneCooldown}s`}</span>
                ) : (
                  <button type="button" onClick={sendPhoneCode} disabled={phoneBusy} className="text-xs text-brown underline">
                    {isAr ? "إعادة إرسال الرمز" : "Resend code"}
                  </button>
                )}
              </div>
              {phoneNotice && <p className="text-xs text-red-700 dark:text-red-400">{phoneNotice}</p>}
            </form>
          )}
        </section>
      </div>

      {bothVerified ? (
        <div className="mt-8 rounded-[10px] border border-emerald-700/20 bg-emerald-700/5 p-6 flex flex-col items-center text-center gap-4">
          <div className="flex flex-col gap-1.5">
            <span className="inline-flex items-center justify-center gap-1.5 text-sm text-emerald-700 dark:text-emerald-400 font-medium">
              <CheckIcon /> {isAr ? "تم التحقق من البريد الإلكتروني" : "Email Verified"}
            </span>
            <span className="inline-flex items-center justify-center gap-1.5 text-sm text-emerald-700 dark:text-emerald-400 font-medium">
              <CheckIcon /> {isAr ? "تم التحقق من الجوال" : "Mobile Verified"}
            </span>
          </div>
          <Button onClick={() => router.push("/vendor/profile")}>{isAr ? "المتابعة إلى ملفي الشخصي" : "Continue to My Profile"}</Button>
        </div>
      ) : (
        <p className="mt-8 text-xs text-brown-light text-center">
          {isAr ? `مرحباً ${businessName} — أكمل التحقق أعلاه للمتابعة.` : `Hi ${businessName} — complete verification above to continue.`}
        </p>
      )}
    </div>
  );
}
