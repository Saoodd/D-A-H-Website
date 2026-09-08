"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale } from "@/lib/i18n/context";
import { Button, LinkButton } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/StatusBadge";

export function PendingVerificationClient({
  businessName,
  communityLink,
}: {
  businessName: string;
  communityLink: string | null;
}) {
  const { locale } = useLocale();
  const router = useRouter();

  async function logout() {
    await fetch("/api/vendor/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  return (
    <div className="container-page py-16 max-w-lg">
      <div className="flex items-center justify-between mb-8">
        <div>
          <p className="text-xs uppercase tracking-widest text-brown-light">{businessName}</p>
          <div className="mt-2">
            <StatusBadge label={locale === "ar" ? "قيد التحقق" : "Verification pending"} tone="attention" />
          </div>
        </div>
        <button onClick={logout} className="text-sm text-brown-light underline">
          {locale === "ar" ? "تسجيل الخروج" : "Log out"}
        </button>
      </div>

      <div className="rounded-[10px] border border-brown/10 bg-cream p-6">
        <h1 className="font-heading text-xl text-brown-dark mb-3">
          {locale === "ar" ? "طلبك قيد التحقق" : "Verification pending"}
        </h1>
        <p className="text-sm text-brown-light">
          {locale === "ar"
            ? "شكراً لإنشائك حساب عملك. سيقوم فريق دار الحي بمراجعة عملك والتحقق منه — سنُعلمك عبر البريد الإلكتروني بمجرد اكتمال ذلك، وحينها ستتمكن من التقديم للفعاليات القادمة."
            : "Thanks for creating your DAH business account. Our team is reviewing and verifying your business — we'll email you once that's done, and you'll be able to apply to upcoming events."}
        </p>
        <LinkButton href="/vendor/profile" variant="secondary" size="sm" className="mt-5">
          {locale === "ar" ? "عرض ملفي الشخصي" : "View my profile"}
        </LinkButton>
      </div>

      <div className="mt-6 rounded-[10px] border border-brown/10 bg-cream p-6 flex items-center justify-between flex-wrap gap-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-brown-light">
            {locale === "ar" ? "مجتمع دار الحي" : "DAH Community"}
          </p>
          <p className="text-sm text-brown-light mt-1">
            {locale === "ar" ? "متاح لكل بائع مسجّل، بغض النظر عن حالة التحقق." : "Open to every registered vendor, regardless of verification status."}
          </p>
        </div>
        {communityLink ? (
          <Button size="sm" onClick={() => window.open(communityLink, "_blank", "noreferrer")}>
            {locale === "ar" ? "انضم عبر واتساب" : "Join on WhatsApp"}
          </Button>
        ) : (
          <span className="text-xs text-brown-light">{locale === "ar" ? "لم يتم تعيين رابط بعد" : "Not set yet"}</span>
        )}
      </div>

      <p className="mt-6 text-xs text-brown-light">
        <Link href="/" className="underline">
          {locale === "ar" ? "العودة إلى الموقع" : "Back to the site"}
        </Link>
      </p>
    </div>
  );
}
