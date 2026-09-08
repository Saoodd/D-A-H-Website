"use client";

import { useState } from "react";
import Link from "next/link";
import { useLocale } from "@/lib/i18n/context";
import { PhoneField } from "@/components/PhoneField";
import { Reveal } from "@/components/Reveal";
import { LuxeCheckbox } from "@/components/ui/LuxeCheckbox";
import { VENDOR_CATEGORIES } from "@/lib/constants";

export function VendorsClient({ tradeLicenseRequired }: { tradeLicenseRequired: boolean }) {
  const { t, locale } = useLocale();
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState<string>(VENDOR_CATEGORIES[0]);
  const [categoryOther, setCategoryOther] = useState("");
  const [instagramHandle, setInstagramHandle] = useState("");
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  const [tradeLicenseFileUrl, setTradeLicenseFileUrl] = useState("");
  const [tradeLicenseFileName, setTradeLicenseFileName] = useState("");
  const [uploadingLicense, setUploadingLicense] = useState(false);

  const [logoUrl, setLogoUrl] = useState("");
  const [uploadingLogo, setUploadingLogo] = useState(false);

  async function handleTradeLicenseChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setUploadingLicense(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/vendor/upload-signup", { method: "POST", body });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Upload failed");
      setTradeLicenseFileUrl(data.url);
      setTradeLicenseFileName(file.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
      e.target.value = "";
    } finally {
      setUploadingLicense(false);
    }
  }

  async function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setUploadingLogo(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/vendor/upload-signup", { method: "POST", body });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Upload failed");
      setLogoUrl(data.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
      e.target.value = "";
    } finally {
      setUploadingLogo(false);
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    const password = String(form.get("password") || "");
    const confirmPassword = String(form.get("confirmPassword") || "");
    if (password !== confirmPassword) {
      setError(locale === "ar" ? "كلمتا المرور غير متطابقتين" : "Passwords do not match");
      return;
    }
    const finalCategory = category === "Other" ? categoryOther.trim() : category;
    if (!finalCategory) {
      setError(locale === "ar" ? "يرجى تحديد الفئة" : "Please specify your category");
      return;
    }
    if (tradeLicenseRequired && !tradeLicenseFileUrl) {
      setError(locale === "ar" ? "الرخصة التجارية مطلوبة" : "A trade licence document is required");
      return;
    }
    if (!agreedToTerms) {
      setError(
        locale === "ar"
          ? "يجب الموافقة على شروط وأحكام البائعين وسياسة الخصوصية"
          : "You must agree to the Vendor Terms & Conditions and Privacy Policy"
      );
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/vendor/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessName: form.get("businessName"),
          contactName: form.get("contactName"),
          email: form.get("email"),
          phone: form.get("phone"),
          category: finalCategory,
          instagram: instagramHandle.trim() ? `@${instagramHandle.trim().replace(/^@/, "")}` : "",
          description: form.get("description"),
          password,
          logoUrl,
          tradeLicenseFileUrl,
          agreedToTerms,
          website: form.get("website"), // honeypot
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Something went wrong");
      }
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="container-page py-16 max-w-4xl">
      <Reveal>
        <header className="max-w-2xl mb-12">
          <h1 className="font-heading text-3xl md:text-4xl text-brown-dark">{t("vendorInfo.title")}</h1>
          <p className="mt-3 text-brown-light">{t("vendorInfo.subtitle")}</p>
          <p className="mt-4 text-sm text-brown-light">
            {t("vendorInfo.loginPrompt")}{" "}
            <Link href="/vendor/login" className="underline text-brown">
              {t("vendorInfo.loginLink")}
            </Link>
          </p>
        </header>
      </Reveal>

      <Reveal delayMs={100} id="apply" className="bg-cream rounded-2xl border border-brown/10 p-6 md:p-10">
        {done ? (
          <div className="text-center py-10">
            <h3 className="font-heading text-xl text-brown-dark mb-2">
              {locale === "ar" ? "تم إنشاء الحساب" : "Account created"}
            </h3>
            <p className="text-brown-light mb-6">
              {locale === "ar"
                ? "شكراً لك — سيقوم فريقنا بمراجعة عملك والتحقق منه. سجّل الدخول إلى لوحتك في أي وقت لمتابعة الحالة."
                : "Thanks — our team will review and verify your business. Log into your dashboard any time to check the status."}
            </p>
            <Link href="/vendor/dashboard" className="underline text-brown">
              {t("nav.myProfile")}
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="grid sm:grid-cols-2 gap-5">
            {/* Honeypot — hidden from real users, bots tend to fill every field */}
            <div className="hidden" aria-hidden="true">
              <label>
                Website
                <input type="text" name="website" tabIndex={-1} autoComplete="off" />
              </label>
            </div>

            <Field name="businessName" label={t("form.businessName")} required />
            <Field name="contactName" label={t("form.contactName")} required />
            <Field name="email" type="email" label={t("form.email")} required />
            <PhoneField name="phone" label={t("form.phone")} required />

            <label className="flex flex-col gap-1 text-sm">
              {t("form.category")}
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                required
                className="border border-brown/20 rounded-lg px-3 py-2 bg-cream-soft"
              >
                {VENDOR_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              {category === "Other" && (
                <input
                  value={categoryOther}
                  onChange={(e) => setCategoryOther(e.target.value)}
                  required
                  placeholder={locale === "ar" ? "حدد فئتك" : "Tell us your category"}
                  className="mt-1 border border-brown/20 rounded-lg px-3 py-2 bg-cream-soft"
                />
              )}
            </label>

            <label className="flex flex-col gap-1 text-sm">
              {t("form.instagram")}
              <div className="flex items-center border border-brown/20 rounded-lg bg-cream-soft overflow-hidden focus-within:ring-1 focus-within:ring-brown">
                <span className="pl-3 pr-1 text-brown-light select-none">@</span>
                <input
                  value={instagramHandle}
                  onChange={(e) => setInstagramHandle(e.target.value.replace(/^@/, ""))}
                  placeholder="yourbusiness"
                  className="flex-1 min-w-0 px-1 py-2 pr-3 bg-transparent outline-none"
                />
              </div>
            </label>

            <label className="flex flex-col gap-1 text-sm sm:col-span-2">
              {locale === "ar" ? "وصف قصير عن عملك" : "Short business description"}
              <textarea
                name="description"
                rows={3}
                maxLength={500}
                placeholder={locale === "ar" ? "بضع جمل عن ما تقدمه" : "A couple of sentences about what you offer"}
                className="border border-brown/20 rounded-lg px-3 py-2 bg-cream-soft"
              />
            </label>

            <div className="sm:col-span-2 flex flex-col gap-1 text-sm">
              {t("vendorInfo.businessLogoOptional")}
              <div className="flex items-center gap-4">
                {logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- vendor-uploaded logo via Blob, not a static asset
                  <img src={logoUrl} alt="" className="w-14 h-14 rounded-full object-cover border border-brown/15 shrink-0" />
                ) : (
                  <div className="w-14 h-14 rounded-full border border-dashed border-brown/25 shrink-0" aria-hidden="true" />
                )}
                <label className="text-sm px-4 py-2 rounded-full border border-brown/25 text-brown-dark hover:bg-brown/5 cursor-pointer transition-colors">
                  {uploadingLogo ? t("vendorInfo.uploading") : t("vendorProfile.uploadLogo")}
                  <input type="file" accept="image/png,image/jpeg,image/webp" onChange={handleLogoChange} className="hidden" />
                </label>
              </div>
            </div>

            <Field name="password" type="password" label={t("form.password")} required minLength={8} />
            <Field name="confirmPassword" type="password" label={t("form.confirmPassword")} required minLength={8} />

            <label className="flex flex-col gap-1 text-sm sm:col-span-2">
              {tradeLicenseRequired ? t("vendorInfo.tradeLicenseRequired") : t("vendorInfo.tradeLicenseOptional")}
              <input
                type="file"
                accept="application/pdf,image/jpeg,image/png"
                onChange={handleTradeLicenseChange}
                required={tradeLicenseRequired && !tradeLicenseFileUrl}
                className="border border-brown/20 rounded-lg px-3 py-2 bg-cream-soft text-sm file:me-3 file:rounded-full file:border-0 file:bg-brown file:text-cream-soft file:px-3 file:py-1 file:text-xs"
              />
              <span className="text-xs text-brown-light">
                {uploadingLicense
                  ? t("vendorInfo.uploading")
                  : tradeLicenseFileName
                  ? tradeLicenseFileName
                  : t("vendorInfo.tradeLicenseHint")}
              </span>
            </label>

            <div className="sm:col-span-2 rounded-2xl border border-brown/15 bg-cream-soft/70 p-6 md:p-7">
              <div className="flex items-center gap-2 mb-3">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-brown-light shrink-0"
                  aria-hidden="true"
                >
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <path d="M14 2v6h6" />
                  <path d="M9 13h6M9 17h6" />
                </svg>
                <p className="label-caps">{t("vendorInfo.agreementTitle")}</p>
              </div>

              <p className="text-sm text-brown-light leading-relaxed mb-4">{t("vendorInfo.agreementIntro")}</p>

              <div className="flex flex-wrap gap-x-6 gap-y-2 mb-5 text-sm">
                <Link href="/vendor-terms" target="_blank" className="text-brown underline decoration-brown/30 underline-offset-4 hover:decoration-brown">
                  {t("vendorInfo.viewVendorTerms")}
                </Link>
                <Link href="/legal/privacy" target="_blank" className="text-brown underline decoration-brown/30 underline-offset-4 hover:decoration-brown">
                  {t("vendorInfo.viewPrivacyPolicy")}
                </Link>
              </div>

              <label className="flex items-start gap-3 pt-5 border-t border-brown/10 cursor-pointer">
                <LuxeCheckbox checked={agreedToTerms} onChange={setAgreedToTerms} required className="mt-0.5" />
                <span className="text-sm text-ink leading-relaxed">
                  {t("vendorInfo.termsAgree")}{" "}
                  <Link href="/vendor-terms" target="_blank" className="underline text-brown decoration-brown/30 underline-offset-4 hover:decoration-brown">
                    {t("vendorInfo.vendorTerms")}
                  </Link>{" "}
                  {t("vendorInfo.termsAnd")}{" "}
                  <Link href="/legal/privacy" target="_blank" className="underline text-brown decoration-brown/30 underline-offset-4 hover:decoration-brown">
                    {t("vendorInfo.privacyPolicy")}
                  </Link>
                  .
                </span>
              </label>
            </div>

            {error && <p className="sm:col-span-2 text-sm text-red-700">{error}</p>}

            <div className="sm:col-span-2">
              <button
                type="submit"
                disabled={submitting || uploadingLicense || uploadingLogo}
                className="px-7 py-3 rounded-full bg-brown text-cream-soft text-sm tracking-wide hover:bg-brown-dark transition-colors disabled:opacity-50"
              >
                {submitting ? "…" : t("vendorInfo.submit")}
              </button>
            </div>
          </form>
        )}
      </Reveal>
    </div>
  );
}

function Field({
  name,
  label,
  type = "text",
  required,
  minLength,
}: {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  minLength?: number;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      {label}
      <input
        name={name}
        type={type}
        required={required}
        minLength={minLength}
        className="border border-brown/20 rounded-lg px-3 py-2 bg-cream-soft"
      />
    </label>
  );
}
