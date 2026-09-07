"use client";

import { useLocale } from "@/lib/i18n/context";

export function LanguageToggle({ className = "" }: { className?: string }) {
  const { locale, setLocale, t } = useLocale();
  return (
    <button
      type="button"
      onClick={() => setLocale(locale === "en" ? "ar" : "en")}
      className={`text-xs tracking-wide border border-brown/30 rounded-full px-3 py-1.5 hover:bg-brown hover:text-cream-soft transition-colors ${className}`}
      aria-label="Toggle language"
    >
      {t("lang.toggle")}
    </button>
  );
}
