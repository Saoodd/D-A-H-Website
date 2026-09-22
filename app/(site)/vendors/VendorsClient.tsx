"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale } from "@/lib/i18n/context";
import { PhoneField } from "@/components/PhoneField";
import { Reveal } from "@/components/Reveal";
import { LuxeCheckbox } from "@/components/ui/LuxeCheckbox";
import { FieldError, fieldErrorRingClass } from "@/components/ui/FieldError";
import { VENDOR_CATEGORIES } from "@/lib/constants";
import {
  validateRequired,
  validateEmail,
  validateUsername,
  validatePhone,
  validatePassword,
  validatePasswordConfirmation,
  validateTermsAccepted,
  guessErrorField,
} from "@/lib/clientValidation";

type FieldKey = "businessName" | "contactName" | "email" | "username" | "phone" | "category" | "password" | "confirmPassword" | "terms";
type FieldErrors = Partial<Record<FieldKey, string>>;

export function VendorsClient({ tradeLicenseRequired }: { tradeLicenseRequired: boolean }) {
  const { t, locale } = useLocale();
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const [businessName, setBusinessName] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [phone, setPhone] = useState("");
  const [category, setCategory] = useState<string>(VENDOR_CATEGORIES[0]);
  const [categoryOther, setCategoryOther] = useState("");
  const [instagramHandle, setInstagramHandle] = useState("");
  const [description, setDescription] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [honeypot, setHoneypot] = useState(""); // hidden from real users — see the input below

  const [tradeLicenseFileUrl, setTradeLicenseFileUrl] = useState("");
  const [tradeLicenseFileName, setTradeLicenseFileName] = useState("");
  const [uploadingLicense, setUploadingLicense] = useState(false);

  const [logoUrl, setLogoUrl] = useState("");
  const [uploadingLogo, setUploadingLogo] = useState(false);

  function clearFieldError(key: FieldKey) {
    setFieldErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev));
  }

  async function handleTradeLicenseChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setUploadingLicense(true);
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("purpose", "trade-license");
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
      body.append("purpose", "logo");
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

    const finalCategory = category === "Other" ? categoryOther.trim() : category;
    const nextErrors: FieldErrors = {
      businessName: validateRequired(businessName, locale === "ar" ? "اسم النشاط التجاري" : "business name") || undefined,
      contactName: validateRequired(contactName, locale === "ar" ? "اسم جهة الاتصال" : "contact name") || undefined,
      email: validateEmail(email) || undefined,
      username: validateUsername(username) || undefined,
      phone: validatePhone(phone) || undefined,
      category: finalCategory ? undefined : locale === "ar" ? "يرجى تحديد الفئة." : "Please select your category.",
      password: validatePassword(password) || undefined,
      confirmPassword: validatePasswordConfirmation(password, confirmPassword) || undefined,
      terms: validateTermsAccepted(agreedToTerms) || undefined,
    };
    setFieldErrors(nextErrors);
    if (Object.values(nextErrors).some(Boolean)) return;

    if (tradeLicenseRequired && !tradeLicenseFileUrl) {
      setError(locale === "ar" ? "الرخصة التجارية مطلوبة." : "A trade licence document is required.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/vendor/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessName,
          contactName,
          email,
          username,
          phone,
          category: finalCategory,
          instagram: instagramHandle.trim() ? `@${instagramHandle.trim().replace(/^@/, "")}` : "",
          description,
          password,
          logoUrl,
          tradeLicenseFileUrl,
          agreedToTerms,
          website: honeypot,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const message: string = body.error || (locale === "ar" ? "حدث خطأ ما" : "Something went wrong");
        const field = guessErrorField(message);
        if (field && ["username", "email", "password", "phone", "terms"].includes(field)) {
          setFieldErrors((prev) => ({ ...prev, [field as FieldKey]: message }));
        } else {
          setError(message);
        }
        return;
      }
      // Account created — take them straight to Profile, where the phone
      // verification prompt is front and center (email needs no
      // verification step at all anymore).
      router.push("/vendor/profile");
      router.refresh();
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
        <form onSubmit={handleSubmit} noValidate className="grid sm:grid-cols-2 gap-5">
            {/* Honeypot — hidden from real users, bots tend to fill every field */}
            <div className="hidden" aria-hidden="true">
              <label>
                Website
                <input type="text" value={honeypot} onChange={(e) => setHoneypot(e.target.value)} tabIndex={-1} autoComplete="off" />
              </label>
            </div>

            <TextField
              label={t("form.businessName")}
              required
              value={businessName}
              onChange={(v) => {
                setBusinessName(v);
                clearFieldError("businessName");
              }}
              error={fieldErrors.businessName}
            />
            <TextField
              label={t("form.contactName")}
              required
              value={contactName}
              onChange={(v) => {
                setContactName(v);
                clearFieldError("contactName");
              }}
              error={fieldErrors.contactName}
            />
            <TextField
              label={t("form.email")}
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(v) => {
                setEmail(v);
                clearFieldError("email");
              }}
              error={fieldErrors.email}
            />

            <label className="flex flex-col gap-1 text-sm">
              <span>
                {locale === "ar" ? "اسم المستخدم" : "Username"}
                <RequiredMark />
              </span>
              <input
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  clearFieldError("username");
                }}
                autoComplete="username"
                aria-invalid={!!fieldErrors.username}
                className={`border rounded-lg px-3 py-2 bg-cream-soft ${fieldErrors.username ? fieldErrorRingClass : "border-brown/20"}`}
              />
              <span className="text-xs text-brown-light mt-0.5">
                {locale === "ar"
                  ? "يمكن استخدام اسم المستخدم لتسجيل الدخول إلى حسابك في دار الحي."
                  : "Your username can be used to log in to your DAH account."}
              </span>
              <FieldError message={fieldErrors.username} />
            </label>

            <PhoneField
              name="phone"
              label={t("form.phone")}
              required
              error={fieldErrors.phone}
              onChangeValue={(v) => {
                setPhone(v);
                clearFieldError("phone");
              }}
            />

            <label className="flex flex-col gap-1 text-sm">
              <span>
                {t("form.category")}
                <RequiredMark />
              </span>
              <select
                value={category}
                onChange={(e) => {
                  setCategory(e.target.value);
                  clearFieldError("category");
                }}
                className={`border rounded-lg px-3 py-2 bg-cream-soft ${fieldErrors.category ? fieldErrorRingClass : "border-brown/20"}`}
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
                  onChange={(e) => {
                    setCategoryOther(e.target.value);
                    clearFieldError("category");
                  }}
                  placeholder={locale === "ar" ? "حدد فئتك" : "Tell us your category"}
                  className="mt-1 border border-brown/20 rounded-lg px-3 py-2 bg-cream-soft"
                />
              )}
              <FieldError message={fieldErrors.category} />
            </label>

            <label className="flex flex-col gap-1 text-sm">
              <span>
                {t("form.instagram")} <span className="text-brown-light font-normal">— {locale === "ar" ? "اختياري" : "Optional"}</span>
              </span>
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
              <span>
                {locale === "ar" ? "وصف قصير عن عملك" : "Short business description"}{" "}
                <span className="text-brown-light font-normal">— {locale === "ar" ? "اختياري" : "Optional"}</span>
              </span>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
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

            <PasswordField
              label={t("form.password")}
              value={password}
              onChange={(v) => {
                setPassword(v);
                clearFieldError("password");
              }}
              error={fieldErrors.password}
            />
            <PasswordField
              label={t("form.confirmPassword")}
              value={confirmPassword}
              onChange={(v) => {
                setConfirmPassword(v);
                clearFieldError("confirmPassword");
              }}
              error={fieldErrors.confirmPassword}
            />

            <label className="flex flex-col gap-1 text-sm sm:col-span-2">
              {tradeLicenseRequired ? t("vendorInfo.tradeLicenseRequired") : t("vendorInfo.tradeLicenseOptional")}
              <input
                type="file"
                accept="application/pdf,image/jpeg,image/png"
                onChange={handleTradeLicenseChange}
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
                <LuxeCheckbox
                  checked={agreedToTerms}
                  onChange={(v) => {
                    setAgreedToTerms(v);
                    clearFieldError("terms");
                  }}
                  className="mt-0.5"
                />
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
              <FieldError message={fieldErrors.terms} />
            </div>

            {error && <p className="sm:col-span-2 text-sm text-red-700 dark:text-red-400">{error}</p>}

            <div className="sm:col-span-2">
              <button
                type="submit"
                disabled={submitting || uploadingLicense || uploadingLogo}
                className="px-7 py-3 rounded-full bg-brown text-cream-soft text-sm tracking-wide hover:bg-brown-dark transition-colors disabled:opacity-50"
              >
                {submitting ? t("vendorInfo.submitting") : t("vendorInfo.submit")}
              </button>
            </div>
        </form>
      </Reveal>
    </div>
  );
}

// Subtle, muted required-field marker — deliberately not red, so a form
// full of required fields never reads as an error state. This is only a
// visual cue now — actual required-ness is enforced by our own submit-time
// validation (see lib/clientValidation.ts), never the native `required`
// attribute, so there's no browser validation popup to keep in sync with it.
function RequiredMark() {
  return (
    <span className="text-brown/40" aria-hidden="true">
      {" "}
      *
    </span>
  );
}

function TextField({
  label,
  type = "text",
  required,
  autoComplete,
  value,
  onChange,
  error,
}: {
  label: string;
  type?: string;
  required?: boolean;
  autoComplete?: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span>
        {label}
        {required && <RequiredMark />}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        aria-invalid={!!error}
        className={`border rounded-lg px-3 py-2 bg-cream-soft ${error ? fieldErrorRingClass : "border-brown/20"}`}
      />
      <FieldError message={error} />
    </label>
  );
}

// Same show/hide behavior as the vendor login form's password field — each
// instance keeps its own toggle state, so Password and Confirm password can
// be shown/hidden independently.
function PasswordField({ label, value, onChange, error }: { label: string; value: string; onChange: (v: string) => void; error?: string }) {
  const { t } = useLocale();
  const [visible, setVisible] = useState(false);
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span>
        {label}
        <RequiredMark />
      </span>
      <span className="relative flex items-center">
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          type={visible ? "text" : "password"}
          autoComplete="new-password"
          aria-invalid={!!error}
          className={`border rounded-lg px-3 py-2 bg-cream-soft w-full pe-16 ${error ? fieldErrorRingClass : "border-brown/20"}`}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="absolute end-3 text-xs text-brown-light hover:text-brown"
        >
          {visible ? t("form.hidePassword") : t("form.showPassword")}
        </button>
      </span>
      <FieldError message={error} />
    </label>
  );
}
