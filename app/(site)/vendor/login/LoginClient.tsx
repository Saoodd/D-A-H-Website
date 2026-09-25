"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { useLocale } from "@/lib/i18n/context";
import { Button } from "@/components/ui/Button";
import { FieldError, fieldErrorRingClass } from "@/components/ui/FieldError";
import { GoogleMark } from "@/components/auth/GoogleMark";

const GOOGLE_MESSAGES: Record<string, { en: string; ar: string }> = {
  not_linked: {
    en: "This Google account isn't linked to a DAH account. Sign in with your email or username and password, then link Google from My Profile.",
    ar: "حساب Google هذا غير مرتبط بحساب في دار الحي. سجّل الدخول بالبريد الإلكتروني أو اسم المستخدم وكلمة المرور، ثم اربط Google من ملفك الشخصي.",
  },
  cancelled: { en: "Google sign-in was cancelled.", ar: "تم إلغاء تسجيل الدخول عبر Google." },
  failed: {
    en: "Signing in with Google didn't work. Please try again or use your password.",
    ar: "تعذر تسجيل الدخول عبر Google. حاول مرة أخرى أو استخدم كلمة المرور.",
  },
};

export function LoginClient({
  next,
  googleEnabled = false,
  googleStatus,
}: {
  next: string;
  googleEnabled?: boolean;
  googleStatus?: string;
}) {
  const { t, locale } = useLocale();
  const router = useRouter();

  const [step, setStep] = useState<1 | 2>(1);
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [identifierError, setIdentifierError] = useState<string | null>(null);
  const [passwordFieldError, setPasswordFieldError] = useState<string | null>(null);
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
    if (!trimmed) {
      setIdentifierError(locale === "ar" ? "يرجى إدخال البريد الإلكتروني أو اسم المستخدم." : "Please enter your email or username.");
      return;
    }
    setIdentifierError(null);
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
    if (!password) {
      setPasswordFieldError(locale === "ar" ? "يرجى إدخال كلمة المرور." : "Please enter your password.");
      return;
    }
    setPasswordFieldError(null);
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
            <form onSubmit={handleContinue} noValidate className="flex flex-col gap-8">
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
                  onChange={(e) => {
                    setIdentifier(e.target.value);
                    if (identifierError) setIdentifierError(null);
                  }}
                  autoFocus
                  autoComplete="username"
                  aria-invalid={!!identifierError}
                  className={`border rounded-lg px-4 py-3 bg-transparent focus:outline-none focus:ring-1 focus:border-brown transition-colors ${
                    identifierError ? fieldErrorRingClass : "border-brown/20 focus:ring-brown"
                  }`}
                />
                <FieldError message={identifierError} />
              </label>

              {googleStatus && GOOGLE_MESSAGES[googleStatus] && (
                <p className="-mt-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900" role="alert">
                  {GOOGLE_MESSAGES[googleStatus][locale === "ar" ? "ar" : "en"]}
                </p>
              )}

              <Button type="submit" size="lg" className="w-full">
                {locale === "ar" ? "متابعة" : "Continue"}
              </Button>

              {googleEnabled && (
                <>
                  <div className="flex items-center gap-3 text-xs uppercase tracking-widest text-brown-light">
                    <span className="h-px flex-1 bg-brown/15" />
                    {locale === "ar" ? "أو" : "or"}
                    <span className="h-px flex-1 bg-brown/15" />
                  </div>
                  {/* A plain link, not fetch: the route answers with a redirect to Google. */}
                  <a
                    href={`/api/auth/google/start?intent=login&next=${encodeURIComponent(next)}`}
                    className="-mt-4 inline-flex w-full items-center justify-center gap-3 rounded-[6px] border border-brown/25 px-7 py-3 text-sm font-medium text-brown-dark transition-colors hover:bg-brown/5"
                  >
                    <GoogleMark />
                    {locale === "ar" ? "المتابعة باستخدام Google" : "Continue with Google"}
                  </a>
                </>
              )}

              <div className="flex items-center justify-center gap-2 text-sm text-brown-light flex-wrap">
                <span>{locale === "ar" ? "جديد على دار الحي؟" : "New to DAH?"}</span>
                <Link href="/vendors" className="text-brown-dark underline underline-offset-2 hover:text-brown">
                  {locale === "ar" ? "أنشئ حساب عمل" : "Become a Vendor"}
                </Link>
                <span className="text-brown-light/40">·</span>
                <Link href="/vendor/forgot-username" className="text-brown-dark underline underline-offset-2 hover:text-brown">
                  {locale === "ar" ? "نسيت اسم المستخدم؟" : "Forgot Username?"}
                </Link>
              </div>
            </form>
          ) : (
            <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-8">
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
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (passwordFieldError) setPasswordFieldError(null);
                    }}
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    aria-invalid={!!passwordFieldError}
                    className={`w-full border rounded-lg px-4 py-3 pe-16 bg-transparent focus:outline-none focus:ring-1 focus:border-brown transition-colors ${
                      passwordFieldError ? fieldErrorRingClass : "border-brown/20 focus:ring-brown"
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute end-4 text-xs text-brown-light hover:text-brown"
                  >
                    {showPassword ? t("form.hidePassword") : t("form.showPassword")}
                  </button>
                </span>
                <FieldError message={passwordFieldError} />
              </label>

              {error && (
                <p role="alert" className="text-sm text-red-700 dark:text-red-400 -mt-4">
                  {error}
                </p>
              )}

              <Button type="submit" size="lg" loading={submitting} className="w-full">
                {locale === "ar" ? "تسجيل الدخول" : "Log In"}
              </Button>

              <Link
                href="/vendor/forgot-password"
                className="text-center text-sm text-brown-light hover:text-brown-dark underline underline-offset-2 transition-colors"
              >
                {locale === "ar" ? "نسيت كلمة المرور؟" : "Forgot Password?"}
              </Link>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
