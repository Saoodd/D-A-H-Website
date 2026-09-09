"use client";

import { useState } from "react";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { useLocale } from "@/lib/i18n/context";
import { Button } from "@/components/ui/Button";
import { FieldError, fieldErrorRingClass } from "@/components/ui/FieldError";
import { validateEmail } from "@/lib/clientValidation";

export function ForgotUsernameClient() {
  const { locale } = useLocale();
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const err = validateEmail(email);
    if (err) {
      setEmailError(err);
      return;
    }
    setEmailError(null);
    setSubmitting(true);
    try {
      await fetch("/api/vendor/forgot-username", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
    } finally {
      setSubmitting(false);
      setSent(true);
    }
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-5 py-20">
      <div className="w-full max-w-sm">
        <div className="flex justify-center mb-12">
          <Logo />
        </div>

        {sent ? (
          <div className="flex flex-col gap-8 text-center">
            <div>
              <h1 className="font-heading text-3xl text-brown-dark mb-3">{locale === "ar" ? "تحقق من بريدك الإلكتروني" : "Check your email"}</h1>
              <p className="text-sm text-brown-light leading-relaxed">
                {locale === "ar"
                  ? "إذا كان هناك حساب مرتبط بهذا البريد، فقد أرسلنا إليك اسم المستخدم."
                  : "If an account exists with that email, we've sent your username."}
              </p>
            </div>
            <Link href="/vendor/login" className="text-sm text-brown-dark underline underline-offset-2 hover:text-brown">
              {locale === "ar" ? "→ العودة لتسجيل الدخول" : "← Return to login"}
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-8">
            <div className="text-center">
              <h1 className="font-heading text-3xl text-brown-dark mb-3">{locale === "ar" ? "نسيت اسم المستخدم؟" : "Forgot username?"}</h1>
              <p className="text-sm text-brown-light">
                {locale === "ar" ? "أدخل بريد حسابك وسنرسل لك اسم المستخدم." : "Enter your account email and we'll send you your username."}
              </p>
            </div>

            <label className="flex flex-col gap-2 text-sm">
              <span className="text-brown-dark">{locale === "ar" ? "البريد الإلكتروني" : "Email"}</span>
              <input
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (emailError) setEmailError(null);
                }}
                autoFocus
                autoComplete="email"
                aria-invalid={!!emailError}
                className={`border rounded-lg px-4 py-3 bg-transparent focus:outline-none focus:ring-1 focus:border-brown transition-colors ${
                  emailError ? fieldErrorRingClass : "border-brown/20 focus:ring-brown"
                }`}
              />
              <FieldError message={emailError} />
            </label>

            <Button type="submit" size="lg" loading={submitting} className="w-full">
              {locale === "ar" ? "إرسال اسم المستخدم" : "Send Username"}
            </Button>

            <Link href="/vendor/login" className="text-center text-sm text-brown-light hover:text-brown-dark underline underline-offset-2 transition-colors">
              {locale === "ar" ? "→ العودة لتسجيل الدخول" : "← Return to login"}
            </Link>
          </form>
        )}
      </div>
    </div>
  );
}
