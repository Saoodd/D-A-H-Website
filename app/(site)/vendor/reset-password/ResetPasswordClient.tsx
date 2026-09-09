"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Logo } from "@/components/Logo";
import { useLocale } from "@/lib/i18n/context";
import { Button } from "@/components/ui/Button";
import { FieldError, fieldErrorRingClass } from "@/components/ui/FieldError";
import { validatePassword, validatePasswordConfirmation } from "@/lib/clientValidation";

export function ResetPasswordClient({ token }: { token: string }) {
  const { locale } = useLocale();
  const router = useRouter();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const pwErr = validatePassword(password);
    const confirmErr = validatePasswordConfirmation(password, confirmPassword);
    setPasswordError(pwErr);
    setConfirmError(confirmErr);
    if (pwErr || confirmErr) return;

    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/vendor/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not reset password.");
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reset password.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!token) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-5 py-20">
        <div className="w-full max-w-sm text-center flex flex-col gap-8">
          <div className="flex justify-center">
            <Logo />
          </div>
          <p className="text-sm text-red-700 dark:text-red-400">
            {locale === "ar" ? "رابط إعادة التعيين غير صالح أو منتهي الصلاحية." : "This reset link is invalid or has expired."}
          </p>
          <Link href="/vendor/forgot-password" className="text-sm text-brown-dark underline underline-offset-2 hover:text-brown">
            {locale === "ar" ? "طلب رابط جديد" : "Request a new link"}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-5 py-20">
      <div className="w-full max-w-sm">
        <div className="flex justify-center mb-12">
          <Logo />
        </div>

        {done ? (
          <div className="flex flex-col gap-8 text-center">
            <div>
              <h1 className="font-heading text-3xl text-brown-dark mb-3">{locale === "ar" ? "تم تحديث كلمة المرور" : "Password updated"}</h1>
              <p className="text-sm text-brown-light">
                {locale === "ar" ? "يمكنك الآن تسجيل الدخول بكلمة المرور الجديدة." : "You can now log in with your new password."}
              </p>
            </div>
            <Button size="lg" className="w-full" onClick={() => router.push("/vendor/login")}>
              {locale === "ar" ? "الذهاب لتسجيل الدخول" : "Go to Login"}
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-8">
            <div className="text-center">
              <h1 className="font-heading text-3xl text-brown-dark mb-3">{locale === "ar" ? "اختر كلمة مرور جديدة" : "Choose a new password"}</h1>
            </div>

            <label className="flex flex-col gap-2 text-sm">
              <span className="text-brown-dark">{locale === "ar" ? "كلمة المرور الجديدة" : "New password"}</span>
              <span className="relative flex items-center">
                <input
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (passwordError) setPasswordError(null);
                  }}
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  autoFocus
                  aria-invalid={!!passwordError}
                  className={`w-full border rounded-lg px-4 py-3 pe-16 bg-transparent focus:outline-none focus:ring-1 focus:border-brown transition-colors ${
                    passwordError ? fieldErrorRingClass : "border-brown/20 focus:ring-brown"
                  }`}
                />
                <button type="button" onClick={() => setShowPassword((v) => !v)} className="absolute end-4 text-xs text-brown-light hover:text-brown">
                  {showPassword ? (locale === "ar" ? "إخفاء" : "Hide") : locale === "ar" ? "إظهار" : "Show"}
                </button>
              </span>
              <FieldError message={passwordError} />
            </label>

            <label className="flex flex-col gap-2 text-sm">
              <span className="text-brown-dark">{locale === "ar" ? "تأكيد كلمة المرور" : "Confirm password"}</span>
              <input
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  if (confirmError) setConfirmError(null);
                }}
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                aria-invalid={!!confirmError}
                className={`border rounded-lg px-4 py-3 bg-transparent focus:outline-none focus:ring-1 focus:border-brown transition-colors ${
                  confirmError ? fieldErrorRingClass : "border-brown/20 focus:ring-brown"
                }`}
              />
              <FieldError message={confirmError} />
            </label>

            {error && (
              <p role="alert" className="text-sm text-red-700 dark:text-red-400 -mt-4">
                {error}
              </p>
            )}

            <Button type="submit" size="lg" loading={submitting} className="w-full">
              {locale === "ar" ? "تحديث كلمة المرور" : "Update Password"}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
