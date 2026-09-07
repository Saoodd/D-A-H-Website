"use client";

import { useState } from "react";
import { useLocale } from "@/lib/i18n/context";

export function ContactClient({ communityLink }: { communityLink: string | null }) {
  const { t, locale } = useLocale();
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    setSubmitting(true);
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.get("name"),
          email: form.get("email"),
          message: form.get("message"),
          website: form.get("website"),
        }),
      });
      if (!res.ok) throw new Error("Something went wrong");
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="container-page py-16 grid md:grid-cols-2 gap-14 max-w-4xl">
      <div>
        <h1 className="font-heading text-3xl md:text-4xl text-brown-dark">{t("contact.title")}</h1>
        <p className="mt-3 text-brown-light">{t("contact.subtitle")}</p>

        <div className="mt-8 space-y-4 text-sm">
          <a
            href="https://instagram.com/daralhay"
            target="_blank"
            rel="noreferrer"
            className="block text-brown hover:underline"
          >
            Instagram &rarr; @daralhay
          </a>
          <a href="mailto:hello@daralhay.ae" className="block text-brown hover:underline">
            hello@daralhay.ae
          </a>
          {communityLink && (
            <a
              href={communityLink}
              target="_blank"
              rel="noreferrer"
              className="inline-block mt-4 px-5 py-2.5 rounded-full bg-brown text-cream-soft text-sm hover:bg-brown-dark transition-colors"
            >
              {t("contact.communityGroup")}
            </a>
          )}
        </div>
      </div>

      <div className="bg-cream rounded-2xl border border-brown/10 p-6 md:p-8">
        {done ? (
          <p className="text-brown-dark">{locale === "ar" ? "شكراً لتواصلك معنا!" : "Thanks for reaching out — we'll reply soon."}</p>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="hidden" aria-hidden="true">
              <label>
                Website
                <input type="text" name="website" tabIndex={-1} autoComplete="off" />
              </label>
            </div>
            <label className="flex flex-col gap-1 text-sm">
              {t("form.name")}
              <input name="name" required className="border border-brown/20 rounded-lg px-3 py-2 bg-cream-soft" />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              {t("form.email")}
              <input name="email" type="email" required className="border border-brown/20 rounded-lg px-3 py-2 bg-cream-soft" />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              {t("form.message")}
              <textarea name="message" required rows={5} className="border border-brown/20 rounded-lg px-3 py-2 bg-cream-soft" />
            </label>
            {error && <p className="text-sm text-red-700">{error}</p>}
            <button
              type="submit"
              disabled={submitting}
              className="self-start px-6 py-2.5 rounded-full bg-brown text-cream-soft text-sm hover:bg-brown-dark transition-colors disabled:opacity-50"
            >
              {t("contact.send")}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
