"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/lib/i18n/context";
import { Button } from "@/components/ui/Button";
import { GoogleMark } from "@/components/auth/GoogleMark";

const STATUS: Record<string, { en: string; ar: string; tone: "ok" | "warn" }> = {
  linked: { en: "Google is now linked. You can use it to sign in.", ar: "تم ربط Google. يمكنك استخدامه لتسجيل الدخول.", tone: "ok" },
  taken: {
    en: "That Google account is already linked to a different DAH account.",
    ar: "حساب Google هذا مرتبط بالفعل بحساب آخر في دار الحي.",
    tone: "warn",
  },
  already: { en: "A Google account is already linked. Unlink it first to use a different one.", ar: "يوجد حساب Google مرتبط بالفعل. ألغِ ربطه أولاً.", tone: "warn" },
  cancelled: { en: "Linking Google was cancelled.", ar: "تم إلغاء ربط Google.", tone: "warn" },
  failed: { en: "Linking Google didn't work. Please try again.", ar: "تعذر ربط Google. حاول مرة أخرى.", tone: "warn" },
};

/** Profile → Sign-in methods. Password always stays available; Google is
 *  an optional extra that only works once linked here. */
export function GoogleSignInCard({
  enabled,
  linked,
  status,
}: {
  enabled: boolean;
  linked: { email: string | null; createdAt: string } | null;
  status?: string;
}) {
  const { locale } = useLocale();
  const isAr = locale === "ar";
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const message = status ? STATUS[status] : undefined;

  async function unlink() {
    if (!window.confirm(isAr ? "إلغاء ربط Google؟ ستستمر في تسجيل الدخول بكلمة المرور." : "Unlink Google? You'll keep signing in with your password.")) return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/vendor/identities/google/unlink", { method: "POST" });
    setBusy(false);
    if (!res.ok) {
      setError(isAr ? "تعذر إلغاء الربط. حاول مرة أخرى." : "Couldn't unlink. Please try again.");
      return;
    }
    router.replace("/vendor/profile");
    router.refresh();
  }

  return (
    <div className="rounded-xl border border-brown/10 bg-cream-soft/70 p-5">
      {message && (
        <p
          role="status"
          className={`mb-4 rounded-lg px-4 py-3 text-sm ${
            message.tone === "ok" ? "border border-emerald-200 bg-emerald-50 text-emerald-900" : "border border-amber-200 bg-amber-50 text-amber-900"
          }`}
        >
          {message[isAr ? "ar" : "en"]}
        </p>
      )}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <GoogleMark className="h-5 w-5 shrink-0" />
          <div className="min-w-0">
            <p className="text-sm text-brown-dark">Google</p>
            <p className="text-xs text-brown-light truncate">
              {linked
                ? linked.email ?? (isAr ? "مرتبط" : "Linked")
                : isAr
                ? "غير مرتبط — سجّل الدخول بنقرة واحدة بعد الربط."
                : "Not linked. Link it to sign in with one click."}
            </p>
          </div>
        </div>
        {linked ? (
          <Button variant="secondary" size="sm" loading={busy} onClick={unlink}>
            {isAr ? "إلغاء الربط" : "Unlink"}
          </Button>
        ) : (
          enabled && (
            <a
              href="/api/auth/google/start?intent=link"
              className="inline-flex items-center justify-center rounded-[6px] border border-brown/25 px-3.5 py-1.5 text-xs font-medium text-brown-dark transition-colors hover:bg-brown/5 whitespace-nowrap"
            >
              {isAr ? "ربط Google" : "Link Google"}
            </a>
          )
        )}
      </div>
      {error && (
        <p className="mt-3 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
