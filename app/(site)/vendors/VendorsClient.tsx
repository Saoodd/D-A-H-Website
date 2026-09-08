"use client";

import { useState } from "react";
import Link from "next/link";
import { useLocale } from "@/lib/i18n/context";
import { PhoneField } from "@/components/PhoneField";
import { Reveal } from "@/components/Reveal";
import { VENDOR_CATEGORIES } from "@/lib/constants";

export function VendorsClient({ tradeLicenseRequired }: { tradeLicenseRequired: boolean }) {
  const { t, locale } = useLocale();
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState<string>(VENDOR_CATEGORIES[0]);
  const [categoryOther, setCategoryOther] = useState("");
  const [instagramHandle, setInstagramHandle] = useState("");

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
        </header>
      </Reveal>

      <Reveal delayMs={100} className="max-w-xl mb-16">
        <h2 className="font-heading text-xl text-brown-dark mb-3">
          {locale === "ar" ? "المتطلبات والتوقعات" : "Requirements & expectations"}
        </h2>
        <ul className="space-y-2 text-brown-light text-sm list-disc pl-4">
          <li>
            {tradeLicenseRequired
              ? locale === "ar"
                ? "رخصة تجارية سارية المفعول"
                : "A valid trade license"
              : locale === "ar"
              ? "رخصة تجارية (اختيارية — أخبرنا إن لم تكن لديك بعد)"
              : "Trade license (optional — let us know if you don't have one yet)"}
          </li>
          <li>{locale === "ar" ? "الالتزام بمواعيد الإعداد والتفكيك" : "On-time setup and breakdown per the event schedule"}</li>
          <li>{locale === "ar" ? "تقديم منتج/خدمة تتماشى مع هوية دار الحي" : "A product or service that fits the DAH brand and mix"}</li>
          <li>{locale === "ar" ? "الالتزام بشروط وأحكام الحجز" : "Agreement to the booking Terms & Conditions"}</li>
        </ul>
        <p className="mt-4 text-xs text-brown-light">
          {locale === "ar"
            ? "بعد إنشاء حسابك، سيقوم فريقنا بمراجعة عملك والتحقق منه. بمجرد التحقق، يمكنك التقديم لأي فعالية قادمة من لوحتك."
            : "After you create your account, our team reviews and verifies your business. Once verified, you can apply to any upcoming event from your dashboard."}
        </p>
        <p className="mt-4 text-sm text-brown-light">
          {t("vendorInfo.loginPrompt")}{" "}
          <Link href="/vendor/login" className="underline text-brown">
            {t("vendorInfo.loginLink")}
          </Link>
        </p>
      </Reveal>

      <Reveal delayMs={200} id="apply" className="bg-cream rounded-2xl border border-brown/10 p-6 md:p-10">
        <h2 className="font-heading text-2xl text-brown-dark mb-1">{t("vendorInfo.applyTitle")}</h2>
        <p className="text-sm text-brown-light mb-6">
          {locale === "ar"
            ? "أنشئ حساب عملك في دار الحي — ليس مرتبطاً بفعالية معينة."
            : "Create your Dar Al Hay business account — this isn't tied to a specific event."}
        </p>

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
              {t("nav.vendorDashboard")}
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

            <Field name="password" type="password" label={t("form.password")} required minLength={8} />
            <Field name="confirmPassword" type="password" label={t("form.confirmPassword")} required minLength={8} />

            {error && <p className="sm:col-span-2 text-sm text-red-700">{error}</p>}

            <div className="sm:col-span-2">
              <button
                type="submit"
                disabled={submitting}
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
