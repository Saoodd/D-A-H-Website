"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { useLocale } from "@/lib/i18n/context";

type State = "loading" | "done" | "error";

export function ConfirmEmailClient({ token }: { token: string }) {
  const { locale } = useLocale();
  const [state, setState] = useState<State>(token ? "loading" : "error");
  const [error, setError] = useState<string | null>(null);
  const [newEmail, setNewEmail] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/vendor/email/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setError(data.error || "This confirmation link is invalid or has expired.");
          setState("error");
          return;
        }
        setNewEmail(data.newEmail || null);
        setState("done");
      } catch {
        if (!cancelled) {
          setError("Something went wrong. Please try again.");
          setState("error");
        }
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

        {state === "loading" && <p className="text-sm text-brown-light">{locale === "ar" ? "جارٍ التحقق..." : "Confirming…"}</p>}

        {state === "done" && (
          <div>
            <h1 className="font-heading text-3xl text-brown-dark mb-3">{locale === "ar" ? "تم تأكيد البريد الإلكتروني" : "Email confirmed"}</h1>
            <p className="text-sm text-brown-light leading-relaxed">
              {locale === "ar" ? `تم تحديث بريد حسابك إلى ${newEmail}.` : `Your account login email is now ${newEmail}.`}
            </p>
          </div>
        )}

        {state === "error" && (
          <div>
            <h1 className="font-heading text-3xl text-brown-dark mb-3">{locale === "ar" ? "الرابط غير صالح" : "Link not valid"}</h1>
            <p className="text-sm text-red-700 dark:text-red-400">
              {error || (locale === "ar" ? "هذا الرابط غير صالح أو منتهي الصلاحية." : "This confirmation link is invalid or has expired.")}
            </p>
          </div>
        )}

        <Link href="/vendor/dashboard" className="text-sm text-brown-dark underline underline-offset-2 hover:text-brown">
          {locale === "ar" ? "الذهاب للوحة التحكم" : "Go to dashboard"}
        </Link>
      </div>
    </div>
  );
}
