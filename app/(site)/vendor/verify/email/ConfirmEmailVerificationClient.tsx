"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { useLocale } from "@/lib/i18n/context";
import { LinkButton } from "@/components/ui/Button";

type State = "loading" | "verified" | "already" | "expired" | "invalid";

export function ConfirmEmailVerificationClient({ token }: { token: string }) {
  const { locale } = useLocale();
  const isAr = locale === "ar";
  const [state, setState] = useState<State>(token ? "loading" : "invalid");

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/vendor/email-verification/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setState(data.code === "EXPIRED" ? "expired" : "invalid");
          return;
        }
        setState(data.alreadyVerified ? "already" : "verified");
      } catch {
        if (!cancelled) setState("invalid");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-5 py-20">
      <div className="w-full max-w-sm text-center flex flex-col gap-8">
        <div className="flex justify-center">
          <Logo />
        </div>

        {state === "loading" && <p className="text-sm text-brown-light">{isAr ? "جارٍ التحقق..." : "Confirming…"}</p>}

        {(state === "verified" || state === "already") && (
          <div>
            <h1 className="font-heading text-3xl text-brown-dark mb-3">{isAr ? "تم التحقق من البريد" : "Email verified"}</h1>
            <p className="text-sm text-brown-light leading-relaxed">
              {state === "already"
                ? isAr
                  ? "تم التحقق من بريدك الإلكتروني مسبقاً."
                  : "Your email has already been verified."
                : isAr
                ? "تم التحقق من بريدك الإلكتروني بنجاح."
                : "Email verified successfully."}
            </p>
            <div className="mt-6">
              <LinkButton href="/vendor/profile" size="md">
                {isAr ? "الذهاب إلى الملف الشخصي" : "Go to Profile"}
              </LinkButton>
            </div>
          </div>
        )}

        {state === "expired" && (
          <div>
            <h1 className="font-heading text-3xl text-brown-dark mb-3">{isAr ? "انتهت صلاحية الرابط" : "Link expired"}</h1>
            <p className="text-sm text-brown-light leading-relaxed">
              {isAr ? "لقد انتهت صلاحية رابط التحقق هذا." : "This verification link has expired."}
            </p>
            <div className="mt-6">
              <LinkButton href="/vendor/profile" size="md">
                {isAr ? "إرسال بريد تحقق جديد" : "Send a New Verification Email"}
              </LinkButton>
            </div>
          </div>
        )}

        {state === "invalid" && (
          <div>
            <h1 className="font-heading text-3xl text-brown-dark mb-3">{isAr ? "رابط غير صالح" : "Link not valid"}</h1>
            <p className="text-sm text-red-700 dark:text-red-400">
              {isAr ? "هذا الرابط غير صالح أو منتهي الصلاحية." : "This verification link is invalid or has expired."}
            </p>
          </div>
        )}

        <Link href="/vendor/profile" className="text-sm text-brown-dark underline underline-offset-2 hover:text-brown">
          {isAr ? "الذهاب إلى الملف الشخصي" : "Go to Profile"}
        </Link>
      </div>
    </div>
  );
}
