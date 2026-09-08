"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useLocale } from "@/lib/i18n/context";

/** Shown instead of the signup form when a vendor session already exists —
 *  the signup route must never let an authenticated vendor create a second
 *  business account (enforced server-side too, see /api/vendor/register). */
export function AlreadySignedInNotice({ businessName }: { businessName: string }) {
  const { locale } = useLocale();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  async function signOutAndReload() {
    setSigningOut(true);
    await fetch("/api/vendor/logout", { method: "POST" });
    router.push("/vendors");
    router.refresh();
  }

  return (
    <div className="bg-cream rounded-2xl border border-brown/10 p-6 md:p-10 text-center">
      <h2 className="font-heading text-xl text-brown-dark mb-2">
        {locale === "ar" ? "أنت مسجل الدخول بالفعل" : "You're already signed in"}
      </h2>
      <p className="text-brown-light mb-6">
        {locale === "ar"
          ? `أنت مسجّل الدخول بحساب عمل في دار الحي (${businessName}). لا يمكن إنشاء أكثر من حساب واحد لكل مستخدم.`
          : `You're already signed in with a DAH business account (${businessName}). Each user can only have one business account.`}
      </p>
      <div className="flex items-center justify-center gap-6 flex-wrap">
        <Link href="/vendor/dashboard" className="px-6 py-2.5 rounded-full bg-brown text-cream-soft text-sm hover:bg-brown-dark transition-colors">
          {locale === "ar" ? "الذهاب إلى حسابي" : "Go to My DAH"}
        </Link>
        <button onClick={signOutAndReload} disabled={signingOut} className="text-sm underline text-brown-light hover:text-brown-dark disabled:opacity-50">
          {locale === "ar" ? "تسجيل الخروج لإنشاء حساب عمل مختلف" : "Sign out to create a different business account"}
        </button>
      </div>
    </div>
  );
}
