"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale } from "@/lib/i18n/context";
import { Countdown } from "@/components/Countdown";
import { DisplayStatus } from "@/lib/constants";

interface AppRow {
  id: string;
  eventName: string;
  eventStartDate: string;
  displayStatus: DisplayStatus;
  acceptanceExpiresAt: string | null;
}

const statusColor: Record<DisplayStatus, string> = {
  PENDING: "bg-cream-deep text-brown-dark",
  REJECTED: "bg-red-100 text-red-800",
  ACCEPTED_UNPAID: "bg-amber-100 text-amber-800",
  PAID: "bg-green-100 text-green-800",
  EXPIRED: "bg-zinc-200 text-zinc-700",
};

export function DashboardClient({
  businessName,
  communityLink,
  applications,
}: {
  businessName: string;
  communityLink: string | null;
  applications: AppRow[];
}) {
  const { t, locale } = useLocale();
  const router = useRouter();

  async function logout() {
    await fetch("/api/vendor/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  return (
    <div className="container-page py-16 max-w-3xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-heading text-3xl text-brown-dark">{t("vendor.dashboardTitle")}</h1>
          <p className="text-brown-light text-sm mt-1">{businessName}</p>
        </div>
        <button onClick={logout} className="text-sm text-brown-light underline">
          {locale === "ar" ? "تسجيل الخروج" : "Log out"}
        </button>
      </div>

      <div className="mb-10 rounded-2xl border border-brown/10 bg-cream p-6 flex items-center justify-between flex-wrap gap-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-brown-light">{t("vendor.communityLink")}</p>
          <p className="text-sm text-brown-light mt-1">
            {locale === "ar" ? "متاحة دائماً لكل بائع مسجل." : "Always visible to any registered vendor."}
          </p>
        </div>
        {communityLink ? (
          <a
            href={communityLink}
            target="_blank"
            rel="noreferrer"
            className="px-5 py-2.5 rounded-full bg-brown text-cream-soft text-sm hover:bg-brown-dark transition-colors"
          >
            {locale === "ar" ? "انضم عبر واتساب" : "Join on WhatsApp"}
          </a>
        ) : (
          <span className="text-sm text-brown-light">
            {locale === "ar" ? "لم يتم تعيين رابط بعد" : "Not set yet"}
          </span>
        )}
      </div>

      <h2 className="font-heading text-xl text-brown-dark mb-4">
        {locale === "ar" ? "طلباتك" : "Your applications"}
      </h2>

      {applications.length === 0 ? (
        <p className="text-brown-light text-sm">
          {locale === "ar" ? "لا توجد طلبات بعد." : "No applications yet."}{" "}
          <Link href="/vendors" className="underline text-brown">
            {t("vendorInfo.applyTitle")}
          </Link>
        </p>
      ) : (
        <div className="space-y-4">
          {applications.map((app) => (
            <Link
              key={app.id}
              href={`/vendor/applications/${app.id}`}
              className="block rounded-xl border border-brown/10 bg-cream-soft hover:bg-cream p-5 transition-colors"
            >
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <p className="font-heading text-brown-dark">{app.eventName}</p>
                  <p className="text-xs text-brown-light">
                    {new Date(app.eventStartDate).toLocaleDateString(locale === "ar" ? "ar-AE" : "en-AE")}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {app.displayStatus === "ACCEPTED_UNPAID" && app.acceptanceExpiresAt && (
                    <span className="text-xs text-brown-light">
                      {t("vendor.deadlineLabel")} <Countdown target={app.acceptanceExpiresAt} />
                    </span>
                  )}
                  <span className={`text-xs px-3 py-1 rounded-full ${statusColor[app.displayStatus]}`}>
                    {t(`vendor.status.${app.displayStatus}`)}
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
