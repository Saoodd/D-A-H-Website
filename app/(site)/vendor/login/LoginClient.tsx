"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { useLocale } from "@/lib/i18n/context";
import { Button } from "@/components/ui/Button";

export function LoginClient({ next }: { next: string }) {
  const { t, locale } = useLocale();
  const router = useRouter();

  const [step, setStep] = useState<1 | 2>(1);
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);

  // Step 1 is purely a client-side transition — no request is made here.
  // The actual account lookup only ever happens once, on the final submit
  // below, so there is nothing at this stage that could reveal whether a
  // given email or username exists.
  function handleContinue(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = identifier.trim();
    if (!trimmed) return;
    setIdentifier(trimmed);
    setError(null);
    setStep(2);
    // Autofocus after the step swaps in.
    requestAnimationFrame(() => passwordRef.current?.focus());
  }

  function handleBack() {
    setError(null);
    setPassword("");
    setStep(1);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/vendor/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier, password }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || (locale === "ar" ? "البريد الإلكتروني/اسم المستخدم أو كلمة المرور غير صحيحة." : "Incorrect email/username or password."));
      }
      router.push(next);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-5 py-20">
      <div className="w-full max-w-sm">
        <div className="flex justify-center mb-12">
          <Logo />
        </div>

        <div key={step} className="auth-step">
          {step === 1 ? (
            <form onSubmit={handleContinue} className="flex flex-col gap-8">
              <div className="text-center">
                <h1 className="font-heading text-3xl text-brown-dark mb-3">
                  {locale === "ar" ? "دخول أعمال دار الحي" : "DAH Business Login"}
                </h1>
                <p className="text-sm text-brown-light">
                  {locale === "ar" ? "ادخل إلى حساب عملك في دار الحي." : "Access your Dar Al Hay business account."}
                </p>
              </div>

              <label className="flex flex-col gap-2 text-sm">
                <span className="text-brown-dark">{locale === "ar" ? "البريد الإلكتروني أو اسم المستخدم" : "Email or Username"}</span>
                <input
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  required
                  autoFocus
                  autoComplete="username"
                  className="border border-brown/20 rounded-lg px-4 py-3 bg-transparent focus:outline-none focus:ring-1 focus:ring-brown focus:border-brown transition-colors"
                />
              </label>

              <Button type="submit" size="lg" className="w-full">
                {locale === "ar" ? "متابعة" : "Continue"}
              </Button>

              <p className="text-center text-sm text-brown-light">
                {locale === "ar" ? "جديد على دار الحي؟" : "New to DAH?"}{" "}
                <Link href="/vendors" className="text-brown-dark underline underline-offset-2 hover:text-brown">
                  {locale === "ar" ? "أنشئ حساب عمل" : "Become a Vendor"}
                </Link>
              </p>
            </form>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-8">
              <button
                type="button"
                onClick={handleBack}
                className="text-sm text-brown-light hover:text-brown-dark transition-colors self-start"
              >
                {locale === "ar" ? "→ رجوع" : "← Back"}
              </button>

              <div>
                <h1 className="font-heading text-3xl text-brown-dark mb-2">{locale === "ar" ? "أهلاً بعودتك" : "Welcome back"}</h1>
                <p className="text-sm text-brown-light truncate" title={identifier}>
                  {identifier}
                </p>
              </div>

              <label className="flex flex-col gap-2 text-sm">
                <span className="text-brown-dark">{t("form.password")}</span>
                <span className="relative flex items-center">
                  <input
                    ref={passwordRef}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    type={showPassword ? "text" : "password"}
                    required
                    autoComplete="current-password"
                    className="w-full border border-brown/20 rounded-lg px-4 py-3 pe-16 bg-transparent focus:outline-none focus:ring-1 focus:ring-brown focus:border-brown transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute end-4 text-xs text-brown-light hover:text-brown"
                  >
                    {showPassword ? t("form.hidePassword") : t("form.showPassword")}
                  </button>
                </span>
              </label>

              {error && (
                <p role="alert" className="text-sm text-red-700 -mt-4">
                  {error}
                </p>
              )}

              <Button type="submit" size="lg" loading={submitting} className="w-full">
                {locale === "ar" ? "تسجيل الدخول" : "Log In"}
              </Button>

              <Link href="/contact" className="text-center text-sm text-brown-light hover:text-brown-dark underline underline-offset-2 transition-colors">
                {locale === "ar" ? "نسيت كلمة المرور؟" : "Forgot Password?"}
              </Link>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
