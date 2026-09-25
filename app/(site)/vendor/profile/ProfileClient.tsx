"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useLocale } from "@/lib/i18n/context";
import { formatAed, VENDOR_CATEGORIES } from "@/lib/constants";
import { VendorNav } from "@/components/vendor/VendorNav";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { MetricCard, EmptyState } from "@/components/ui/Card";
import { ChangeEmailCard } from "@/components/vendor/ChangeEmailCard";
import { DeleteAccountCard } from "@/components/vendor/DeleteAccountCard";
import { PhoneVerifyModal } from "@/components/vendor/PhoneVerifyModal";
import { ActiveSessionsCard } from "@/components/ActiveSessionsCard";
import type { SessionRow } from "@/lib/sessionList";

interface Vendor {
  businessName: string;
  username: string;
  contactName: string;
  email: string;
  phone: string;
  category: string;
  instagram: string | null;
  website: string | null;
  description: string;
  logoUrl: string | null;
  verified: boolean;
  createdAt: string;
  tradeLicenseNumber: string | null;
  tradeLicenseFileUrl: string | null;
  tradeLicenseExpiry: string | null;
  phoneVerified: boolean;
}

interface HistoryEntry {
  applicationId: string;
  eventName: string;
  startDate: string;
  boothCode: string;
  boothSize: string;
  amountAedFils: number;
}

interface UpcomingEntry {
  applicationId: string;
  eventName: string;
  eventSlug: string;
  startDate: string;
  boothCode: string;
}

interface WarningEntry {
  id: string;
  title: string;
  description: string;
  severity: string;
  status: string;
  eventName: string | null;
  viewedAt: string | null;
  acknowledgedAt: string | null;
  createdAt: string;
}

const severityTone: Record<string, "neutral" | "attention" | "negative"> = {
  NOTICE: "neutral",
  WARNING: "attention",
  FINAL_WARNING: "negative",
};

const missingFieldLabelKey: Record<string, string> = {
  businessName: "form.businessName",
  contactName: "form.contactName",
  phone: "form.phone",
  category: "form.category",
  instagram: "form.instagram",
  logoUrl: "vendorProfile.logoLabel",
  description: "form.message",
  // Only ever appears here when Admin → Settings → Trade Licence Required
  // is on (see computeProfileCompletion) — never counted while it's off.
  tradeLicenseFileUrl: "vendorProfile.tradeLicenseTitle",
};

export function ProfileClient({
  vendor,
  stats,
  profileCompletion,
  history,
  upcoming,
  warnings,
  sessions,
}: {
  vendor: Vendor;
  stats: { eventsParticipated: number; upcomingConfirmedCount: number; applicationsCount: number };
  profileCompletion: { percent: number; missing: string[] };
  history: HistoryEntry[];
  upcoming: UpcomingEntry[];
  warnings: WarningEntry[];
  sessions: SessionRow[];
}) {
  const { t, locale } = useLocale();
  const router = useRouter();

  const [businessName, setBusinessName] = useState(vendor.businessName);
  const [contactName, setContactName] = useState(vendor.contactName);
  const [phone, setPhone] = useState(vendor.phone);
  const [category, setCategory] = useState(
    VENDOR_CATEGORIES.includes(vendor.category as (typeof VENDOR_CATEGORIES)[number]) ? vendor.category : "Other"
  );
  const [categoryOther, setCategoryOther] = useState(
    VENDOR_CATEGORIES.includes(vendor.category as (typeof VENDOR_CATEGORIES)[number]) ? "" : vendor.category
  );
  const [instagram, setInstagram] = useState(vendor.instagram || "");
  const [website, setWebsite] = useState(vendor.website || "");
  const [description, setDescription] = useState(vendor.description || "");
  const [logoUrl, setLogoUrl] = useState(vendor.logoUrl || "");
  const [tradeLicenseNumber, setTradeLicenseNumber] = useState(vendor.tradeLicenseNumber || "");
  const [tradeLicenseExpiry, setTradeLicenseExpiry] = useState(vendor.tradeLicenseExpiry || "");
  const [tradeLicenseFileUrl, setTradeLicenseFileUrl] = useState(vendor.tradeLicenseFileUrl || "");

  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingLicense, setUploadingLicense] = useState(false);
  const [notice, setNotice] = useState<{ type: "ok" | "error"; text: string } | null>(null);
  const [ackBusyId, setAckBusyId] = useState<string | null>(null);
  const [verifyingPhone, setVerifyingPhone] = useState(false);

  const dateFmt = (iso: string) => new Date(iso).toLocaleDateString(locale === "ar" ? "ar-AE" : "en-AE");

  async function upload(file: File, setUrl: (url: string) => void, setBusy: (b: boolean) => void, purpose: "logo" | "trade-license") {
    setBusy(true);
    setNotice(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("purpose", purpose);
      const res = await fetch("/api/vendor/upload", { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Upload failed");
      setUrl(data.url);
    } catch (err) {
      setNotice({ type: "error", text: err instanceof Error ? err.message : "Upload failed" });
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    setSaving(true);
    setNotice(null);
    try {
      const res = await fetch("/api/vendor/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessName,
          contactName,
          phone,
          category: category === "Other" ? categoryOther.trim() : category,
          instagram,
          website,
          description,
          logoUrl,
          tradeLicenseNumber,
          tradeLicenseFileUrl,
          tradeLicenseExpiry,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not save");
      setNotice({ type: "ok", text: t("vendorProfile.saved") });
      router.refresh();
    } catch (err) {
      setNotice({ type: "error", text: err instanceof Error ? err.message : "Could not save" });
    } finally {
      setSaving(false);
    }
  }

  async function acknowledge(id: string) {
    setAckBusyId(id);
    try {
      const res = await fetch(`/api/vendor/warnings/${id}/acknowledge`, { method: "POST" });
      if (res.ok) router.refresh();
    } finally {
      setAckBusyId(null);
    }
  }

  const activeWarnings = warnings.filter((w) => w.status === "ACTIVE");
  const resolvedCount = warnings.length - activeWarnings.length;

  return (
    <div className="container-page py-12 md:py-16">
      <div className="flex items-center gap-4 mb-8">
        {vendor.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- vendor-uploaded logo via Blob, not a local static asset
          <img src={vendor.logoUrl} alt={vendor.businessName} className="w-16 h-16 rounded-full object-cover border border-brown/10" />
        ) : (
          <div className="w-16 h-16 rounded-full bg-cream-deep flex items-center justify-center font-heading text-xl text-brown-dark">
            {vendor.businessName.charAt(0).toUpperCase()}
          </div>
        )}
        <div>
          <h1 className="font-heading text-2xl md:text-3xl text-brown-dark">{vendor.businessName}</h1>
          <p className="text-sm text-brown-light mt-0.5">
            {vendor.category}
            {vendor.instagram ? ` · @${vendor.instagram.replace(/^@/, "")}` : ""}
          </p>
          <div className="flex items-center gap-2 mt-1.5">
            <StatusBadge
              label={vendor.verified ? t("vendorProfile.verified") : t("vendorProfile.unverified")}
              tone={vendor.verified ? "positive" : "attention"}
            />
            <span className="text-xs text-brown-light">
              {t("vendorProfile.memberSince")} {dateFmt(vendor.createdAt)}
            </span>
          </div>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-8">
        <VendorNav businessName={vendor.businessName} />

        <div className="flex-1 min-w-0 space-y-8">
          <div className="grid grid-cols-3 gap-4">
            <MetricCard label={t("vendorProfile.statsParticipated")} value={stats.eventsParticipated} />
            <MetricCard label={t("vendorProfile.statsUpcoming")} value={stats.upcomingConfirmedCount} />
            <MetricCard label={t("vendorProfile.statsApplications")} value={stats.applicationsCount} />
          </div>

          <div className="rounded-[10px] border border-brown/10 bg-cream p-6">
            <div className="flex items-center justify-between mb-2">
              <p className="label-caps">{t("vendorProfile.completionLabel")}</p>
              <span className="text-sm text-brown-dark font-medium">{profileCompletion.percent}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-brown/10 overflow-hidden">
              <div className="h-full bg-brown rounded-full transition-all" style={{ width: `${profileCompletion.percent}%` }} />
            </div>
            {profileCompletion.missing.length > 0 && (
              <div className="mt-3">
                <p className="text-xs text-brown-light">{t("vendorProfile.completionHint")}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {profileCompletion.missing.map((field) => (
                    <span key={field} className="text-[11px] bg-cream-deep text-brown-dark rounded-full px-2.5 py-0.5">
                      {missingFieldLabelKey[field] ? t(missingFieldLabelKey[field]) : field}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {activeWarnings.length > 0 && (
            <div className="rounded-[10px] border border-amber-300/60 bg-amber-50 p-6">
              <p className="label-caps text-amber-900">{t("vendorWarnings.title")}</p>
              <p className="text-xs text-amber-800 mt-1 mb-4">
                {activeWarnings.length} {activeWarnings.length === 1 ? t("vendorWarnings.activeSummary") : t("vendorWarnings.activeSummaryPlural")}
                {resolvedCount > 0 ? ` · ${resolvedCount} ${t("vendorWarnings.resolvedSummary")}` : ""}
              </p>
              <div className="space-y-3">
                {activeWarnings.map((w) => (
                  <div key={w.id} className="rounded-[8px] bg-cream border border-amber-200/60 p-4">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div>
                        <div className="flex items-center gap-2">
                          <StatusBadge label={t(`vendorWarnings.severity.${w.severity}`)} tone={severityTone[w.severity] ?? "neutral"} />
                          <p className="font-heading text-brown-dark">{w.title}</p>
                        </div>
                        <p className="text-xs text-brown-light mt-1">
                          {dateFmt(w.createdAt)}
                          {w.eventName ? ` · ${w.eventName}` : ""}
                        </p>
                      </div>
                      {!w.acknowledgedAt && (
                        <Button size="sm" variant="secondary" onClick={() => acknowledge(w.id)} loading={ackBusyId === w.id}>
                          {t("vendorWarnings.acknowledge")}
                        </Button>
                      )}
                      {w.acknowledgedAt && <span className="text-xs text-brown-light">{t("vendorWarnings.acknowledged")}</span>}
                    </div>
                    <p className="text-sm text-brown-light mt-2">{w.description}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-[10px] border border-brown/10 bg-cream p-6">
            <p className="label-caps mb-5">{t("vendorProfile.editTitle")}</p>
            <div className="grid sm:grid-cols-2 gap-4">
              <label className="flex flex-col gap-1 text-sm">
                {t("form.businessName")}
                <input value={businessName} onChange={(e) => setBusinessName(e.target.value)} className="border border-brown/20 rounded-lg px-3 py-2 bg-cream-soft" />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                {t("form.contactName")}
                <input value={contactName} onChange={(e) => setContactName(e.target.value)} className="border border-brown/20 rounded-lg px-3 py-2 bg-cream-soft" />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="flex items-center justify-between gap-2">
                  <span>{t("form.phone")}</span>
                  {vendor.phoneVerified ? (
                    <StatusBadge label={locale === "ar" ? "تم التحقق" : "Verified"} tone="positive" />
                  ) : (
                    <button
                      type="button"
                      onClick={() => setVerifyingPhone(true)}
                      className="text-xs text-brown underline underline-offset-2 hover:text-brown-dark shrink-0"
                    >
                      {locale === "ar" ? "التحقق من الجوال" : "Verify Mobile"}
                    </button>
                  )}
                </span>
                <input value={phone} onChange={(e) => setPhone(e.target.value)} className="border border-brown/20 rounded-lg px-3 py-2 bg-cream-soft" />
                {/* Phone is the one real eligibility gate before a vendor can
                    apply/book (server-enforced) — profile completion above
                    is a separate concept and stays 100% regardless of this. */}
                {!vendor.phoneVerified && (
                  <span className="text-xs text-amber-800 dark:text-amber-400">
                    {locale === "ar" ? "التحقق مطلوب للتقديم على الفعاليات" : "Verification required to apply to events"}
                  </span>
                )}
              </label>
              <label className="flex flex-col gap-1 text-sm">
                {locale === "ar" ? "اسم المستخدم" : "Username"}
                <input value={vendor.username} disabled className="border border-brown/10 rounded-lg px-3 py-2 bg-brown/5 text-brown-light" />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                {t("form.category")}
                <select value={category} onChange={(e) => setCategory(e.target.value)} className="border border-brown/20 rounded-lg px-3 py-2 bg-cream-soft">
                  {VENDOR_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
              {category === "Other" && (
                <label className="flex flex-col gap-1 text-sm">
                  {locale === "ar" ? "حدد فئتك" : "Specify category"}
                  <input value={categoryOther} onChange={(e) => setCategoryOther(e.target.value)} className="border border-brown/20 rounded-lg px-3 py-2 bg-cream-soft" />
                </label>
              )}
              <label className="flex flex-col gap-1 text-sm">
                {t("form.instagram")}
                <input value={instagram} onChange={(e) => setInstagram(e.target.value)} className="border border-brown/20 rounded-lg px-3 py-2 bg-cream-soft" />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                {locale === "ar" ? "الموقع الإلكتروني" : "Website"}
                <input value={website} onChange={(e) => setWebsite(e.target.value)} className="border border-brown/20 rounded-lg px-3 py-2 bg-cream-soft" />
              </label>
            </div>
            <label className="flex flex-col gap-1 text-sm mt-4">
              {t("form.message")}
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="border border-brown/20 rounded-lg px-3 py-2 bg-cream-soft"
              />
            </label>

            <div className="mt-5">
              <p className="text-sm mb-1">{t("vendorProfile.logoLabel")}</p>
              <div className="flex items-center gap-3">
                {logoUrl && (
                  // eslint-disable-next-line @next/next/no-img-element -- vendor-uploaded logo via Blob
                  <img src={logoUrl} alt="" className="w-12 h-12 rounded-full object-cover border border-brown/10" />
                )}
                <label className="text-sm px-4 py-2 rounded-[6px] border border-brown/25 text-brown-dark hover:bg-brown/5 cursor-pointer">
                  {uploadingLogo ? t("vendorProfile.uploading") : t("vendorProfile.uploadLogo")}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={(e) => e.target.files?.[0] && upload(e.target.files[0], setLogoUrl, setUploadingLogo, "logo")}
                  />
                </label>
              </div>
            </div>

            <div className="mt-6 pt-6 border-t border-brown/10">
              <p className="label-caps mb-4">{t("vendorProfile.tradeLicenseTitle")}</p>
              <div className="grid sm:grid-cols-2 gap-4">
                <label className="flex flex-col gap-1 text-sm">
                  {t("vendorProfile.tradeLicenseNumber")}
                  <input
                    value={tradeLicenseNumber}
                    onChange={(e) => setTradeLicenseNumber(e.target.value)}
                    className="border border-brown/20 rounded-lg px-3 py-2 bg-cream-soft"
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  {t("vendorProfile.tradeLicenseExpiry")}
                  <input
                    type="date"
                    value={tradeLicenseExpiry}
                    onChange={(e) => setTradeLicenseExpiry(e.target.value)}
                    className="border border-brown/20 rounded-lg px-3 py-2 bg-cream-soft"
                  />
                </label>
              </div>
              <div className="mt-4 flex items-center gap-3">
                {tradeLicenseFileUrl && tradeLicenseFileUrl === (vendor.tradeLicenseFileUrl || "") ? (
                  // Trade licences are stored private — this links to our
                  // own authenticated proxy route, never the raw Blob URL,
                  // and only ever reflects what's actually saved.
                  <a href="/api/vendor/documents/trade-license" target="_blank" rel="noreferrer" className="text-sm underline text-brown">
                    {t("vendorProfile.tradeLicenseFile")}
                  </a>
                ) : (
                  tradeLicenseFileUrl && (
                    <span className="text-sm text-brown-light">{locale === "ar" ? "تم رفع ملف جديد — احفظ للتطبيق" : "New file uploaded — save to apply"}</span>
                  )
                )}
                <label className="text-sm px-4 py-2 rounded-[6px] border border-brown/25 text-brown-dark hover:bg-brown/5 cursor-pointer">
                  {uploadingLicense ? t("vendorProfile.uploading") : t("vendorProfile.uploadFile")}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,application/pdf"
                    className="hidden"
                    onChange={(e) => e.target.files?.[0] && upload(e.target.files[0], setTradeLicenseFileUrl, setUploadingLicense, "trade-license")}
                  />
                </label>
              </div>
            </div>

            {notice && (
              <p className={`mt-5 text-sm ${notice.type === "ok" ? "text-emerald-700" : "text-red-700"}`}>{notice.text}</p>
            )}
            <Button className="mt-5" onClick={save} loading={saving}>
              {saving ? t("vendorProfile.saving") : t("vendorProfile.save")}
            </Button>
          </div>

          <ChangeEmailCard currentEmail={vendor.email} />

          <div>
            <p className="label-caps mb-4">{t("vendorProfile.upcomingTitle")}</p>
            {upcoming.length === 0 ? (
              <EmptyState title={t("vendorProfile.upcomingEmpty")} />
            ) : (
              <div className="space-y-3">
                {upcoming.map((u) => (
                  <Link
                    key={u.applicationId}
                    href={`/vendor/applications/${u.applicationId}`}
                    className="block rounded-[10px] border border-brown/10 bg-cream hover:border-brown/25 p-5 transition-colors"
                  >
                    <p className="font-heading text-brown-dark">{u.eventName}</p>
                    <p className="text-xs text-brown-light mt-1">
                      {dateFmt(u.startDate)} · {t("vendorPayments.booth")} {u.boothCode}
                    </p>
                  </Link>
                ))}
              </div>
            )}
          </div>

          <div>
            <p className="label-caps mb-4">{t("vendorProfile.historyTitle")}</p>
            {history.length === 0 ? (
              <EmptyState title={t("vendorProfile.historyEmpty")} />
            ) : (
              <div className="space-y-3">
                {history.map((h) => (
                  <Link
                    key={h.applicationId}
                    href={`/vendor/applications/${h.applicationId}`}
                    className="flex items-center justify-between flex-wrap gap-3 rounded-[10px] border border-brown/10 bg-cream hover:border-brown/25 p-5 transition-colors"
                  >
                    <div>
                      <p className="font-heading text-brown-dark">{h.eventName}</p>
                      <p className="text-xs text-brown-light mt-1">
                        {dateFmt(h.startDate)} · {t("vendorPayments.booth")} {h.boothCode} ({h.boothSize})
                      </p>
                    </div>
                    <p className="text-sm text-brown">{formatAed(h.amountAedFils)}</p>
                  </Link>
                ))}
              </div>
            )}
          </div>

          <div>
            <p className="label-caps mb-1">{locale === "ar" ? "الجلسات النشطة" : "Active Sessions"}</p>
            <p className="text-sm text-brown-light mb-4">
              {locale === "ar"
                ? "الأجهزة المسجّل دخولها إلى حسابك حالياً. إذا لم تتعرف على جهاز، سجّل خروجه وغيّر كلمة المرور."
                : "Devices currently signed in to your account. If you don't recognise one, sign it out and change your password."}
            </p>
            <ActiveSessionsCard sessions={sessions} apiBase="/api/vendor/sessions" locale={locale === "ar" ? "ar" : "en"} signedOutRedirect="/vendor/login" />
          </div>

          <div>
            <p className="label-caps mb-4">{locale === "ar" ? "إعدادات الحساب" : "Account Settings"}</p>
            <DeleteAccountCard username={vendor.username} />
          </div>
        </div>
      </div>

      {verifyingPhone && (
        <PhoneVerifyModal
          onClose={() => setVerifyingPhone(false)}
          onVerified={() => {
            setVerifyingPhone(false);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
