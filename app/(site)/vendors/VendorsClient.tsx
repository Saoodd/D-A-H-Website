"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLocale } from "@/lib/i18n/context";
import { PhoneField } from "@/components/PhoneField";
import { Reveal } from "@/components/Reveal";

interface EventOption {
  id: string;
  slug: string;
  name: string;
  startDate: string;
  categories: string[];
}

export function VendorsClient({ events }: { events: EventOption[] }) {
  const { t, locale } = useLocale();
  const [eventId, setEventId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState("");
  const [categoryOther, setCategoryOther] = useState(false);

  const selectedEvent = events.find((e) => e.id === eventId);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const slug = params.get("event");
    if (slug) {
      const match = events.find((e) => e.slug === slug);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reads the ?event= query param after mount, not derivable during render
      if (match) setEventId(match.id);
    } else if (events.length > 0) {
      setEventId(events[0].id);
    }
  }, [events]);

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
    setSubmitting(true);
    try {
      const res = await fetch("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId,
          businessName: form.get("businessName"),
          contactName: form.get("contactName"),
          email: form.get("email"),
          phone: form.get("phone"),
          category: form.get("category"),
          instagram: form.get("instagram"),
          message: form.get("message"),
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
            {locale === "ar"
              ? "رخصة تجارية (اختيارية — أخبرنا إن لم تكن لديك بعد) وتأمين مناسب"
              : "Trade license (optional — let us know if you don't have one yet) and appropriate insurance"}
          </li>
          <li>{locale === "ar" ? "الالتزام بمواعيد الإعداد والتفكيك" : "On-time setup and breakdown per the event schedule"}</li>
          <li>{locale === "ar" ? "تقديم منتج/خدمة تتماشى مع هوية دار الحي" : "A product or service that fits the DAH brand and mix"}</li>
          <li>{locale === "ar" ? "الالتزام بشروط وأحكام الحجز" : "Agreement to the booking Terms & Conditions"}</li>
        </ul>
        <p className="mt-4 text-xs text-brown-light">
          {locale === "ar"
            ? "رسوم الأكشاك تُشارك معك بعد قبول طلبك."
            : "Booth fees are shared with you once your application is accepted."}
        </p>
      </Reveal>

      <Reveal delayMs={200} id="apply" className="bg-cream rounded-2xl border border-brown/10 p-6 md:p-10">
        <h2 className="font-heading text-2xl text-brown-dark mb-6">{t("vendorInfo.applyTitle")}</h2>

        {done ? (
          <div className="text-center py-10">
            <h3 className="font-heading text-xl text-brown-dark mb-2">{t("vendorInfo.success")}</h3>
            <p className="text-brown-light mb-6">{t("vendorInfo.successBody")}</p>
            <Link href="/vendor/login" className="underline text-brown">
              {t("nav.vendorLogin")}
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

            <label className="flex flex-col gap-1 text-sm sm:col-span-2">
              {t("form.event")}
              <select
                required
                value={eventId}
                onChange={(e) => {
                  setEventId(e.target.value);
                  setCategory("");
                  setCategoryOther(false);
                }}
                className="border border-brown/20 rounded-lg px-3 py-2 bg-cream-soft"
              >
                {events.length === 0 && <option value="">—</option>}
                {events.map((ev) => (
                  <option key={ev.id} value={ev.id}>
                    {ev.name} ({new Date(ev.startDate).toLocaleDateString()})
                  </option>
                ))}
              </select>
            </label>

            <Field name="businessName" label={t("form.businessName")} required />
            <Field name="contactName" label={t("form.contactName")} required />
            <Field name="email" type="email" label={t("form.email")} required />
            <PhoneField name="phone" label={t("form.phone")} required />

            {selectedEvent && selectedEvent.categories.length > 0 ? (
              <label className="flex flex-col gap-1 text-sm">
                {t("form.category")}
                <select
                  required={!categoryOther}
                  name={categoryOther ? undefined : "category"}
                  value={categoryOther ? "__other__" : category}
                  onChange={(e) => {
                    if (e.target.value === "__other__") {
                      setCategoryOther(true);
                      setCategory("");
                    } else {
                      setCategoryOther(false);
                      setCategory(e.target.value);
                    }
                  }}
                  className="border border-brown/20 rounded-lg px-3 py-2 bg-cream-soft"
                >
                  <option value="">—</option>
                  {selectedEvent.categories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                  <option value="__other__">{locale === "ar" ? "أخرى" : "Other"}</option>
                </select>
                {categoryOther && (
                  <input
                    name="category"
                    required
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    placeholder={locale === "ar" ? "حدد فئتك" : "Tell us your category"}
                    className="mt-1 border border-brown/20 rounded-lg px-3 py-2 bg-cream-soft"
                  />
                )}
              </label>
            ) : (
              <Field name="category" label={t("form.category")} required />
            )}

            <Field name="instagram" label={t("form.instagram")} />

            <label className="flex flex-col gap-1 text-sm sm:col-span-2">
              {t("form.message")}
              <textarea
                name="message"
                rows={4}
                className="border border-brown/20 rounded-lg px-3 py-2 bg-cream-soft"
              />
            </label>

            <Field name="password" type="password" label={t("form.password")} required minLength={8} />
            <Field name="confirmPassword" type="password" label={t("form.confirmPassword")} required minLength={8} />

            {error && <p className="sm:col-span-2 text-sm text-red-700">{error}</p>}

            <div className="sm:col-span-2">
              <button
                type="submit"
                disabled={submitting || !eventId}
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
