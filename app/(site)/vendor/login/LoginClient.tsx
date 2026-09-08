"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useLocale } from "@/lib/i18n/context";
import { Button } from "@/components/ui/Button";

export function LoginClient({ next }: { next: string }) {
  const { t } = useLocale();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const form = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/vendor/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: form.get("email"), password: form.get("password") }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Login failed");
      }
      router.push(next);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
      setSubmitting(false);
    }
  }

  return (
    <div className="container-page py-20 max-w-md">
      <h1 className="font-heading text-3xl text-brown-dark mb-2">{t("vendor.loginTitle")}</h1>
      <p className="text-sm text-brown-light mb-8">{t("vendor.registerNote")}</p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4 bg-cream rounded-[10px] border border-brown/10 p-6">
        <label className="flex flex-col gap-1 text-sm">
          {t("form.email")}
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            className="border border-brown/20 rounded-lg px-3 py-2 bg-cream-soft"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {t("form.password")}
          <span className="relative flex items-center">
            <input
              name="password"
              type={showPassword ? "text" : "password"}
              required
              autoComplete="current-password"
              className="border border-brown/20 rounded-lg px-3 py-2 bg-cream-soft w-full pe-16"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute end-3 text-xs text-brown-light hover:text-brown"
            >
              {showPassword ? t("form.hidePassword") : t("form.showPassword")}
            </button>
          </span>
        </label>
        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}
        <Button type="submit" loading={submitting} size="md">
          {t("nav.vendorLogin")}
        </Button>
      </form>

      <p className="mt-6 text-sm text-brown-light">
        <Link href="/vendors" className="underline text-brown">
          {t("vendorInfo.applyTitle")}
        </Link>
      </p>
    </div>
  );
}
