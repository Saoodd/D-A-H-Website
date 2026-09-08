"use client";

import { useRouter } from "next/navigation";
import { useLocale } from "@/lib/i18n/context";

export function PendingVerificationClient({ businessName }: { businessName: string }) {
  const { locale } = useLocale();
  const router = useRouter();

  async function logout() {
    await fetch("/api/vendor/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  return (
    <div className="container-page py-24 max-w-md text-center">
      <p className="text-xs uppercase tracking-widest text-brown-light mb-3">{businessName}</p>
      <h1 className="font-heading text-2xl text-brown-dark mb-4">
        {locale === "ar" ? "طلبك قيد التحقق" : "Verification pending"}
      </h1>
      <p className="text-brown-light text-sm mb-8">
        {locale === "ar"
          ? "شكراً لإنشائك حساب عملك. سيقوم فريق دار الحي بمراجعة عملك والتحقق منه — سنُعلمك عبر البريد الإلكتروني بمجرد اكتمال ذلك، وحينها ستتمكن من التقديم للفعاليات القادمة من هنا."
          : "Thanks for creating your DAH business account. Our team is reviewing and verifying your business — we'll email you once that's done, and you'll be able to apply to upcoming events right from here."}
      </p>
      <button onClick={logout} className="text-sm text-brown-light underline">
        {locale === "ar" ? "تسجيل الخروج" : "Log out"}
      </button>
    </div>
  );
}
