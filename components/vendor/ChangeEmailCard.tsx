"use client";

import { useState } from "react";
import { useLocale } from "@/lib/i18n/context";
import { Button } from "@/components/ui/Button";
import { FieldError, fieldErrorRingClass } from "@/components/ui/FieldError";
import { validateEmail, validatePasswordConfirmation } from "@/lib/clientValidation";

// Secure email change: current password re-authenticates the request, and
// the login email itself never changes here — only once the vendor opens
// the verification link DAH sends to the NEW address (see
// /vendor/profile/confirm-email) does /api/vendor/email/confirm actually
// flip the account's login identifier.
export function ChangeEmailCard({ currentEmail }: { currentEmail: string }) {
  const { locale } = useLocale();
  const [open, setOpen] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [confirmEmail, setConfirmEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<{ newEmail?: string; confirmEmail?: string; password?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  function reset() {
    setOpen(false);
    setNewEmail("");
    setConfirmEmail("");
    setPassword("");
    setErrors({});
    setError(null);
    setSent(false);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const nextErrors: typeof errors = {
      newEmail: validateEmail(newEmail) || undefined,
      confirmEmail: validatePasswordConfirmation(newEmail, confirmEmail)
        ? locale === "ar"
          ? "البريدان الإلكترونيان غير متطابقين."
          : "Email addresses do not match."
        : undefined,
      password: password ? undefined : locale === "ar" ? "يرجى إدخال كلمة المرور الحالية." : "Please enter your current password.",
    };
    setErrors(nextErrors);
    if (Object.values(nextErrors).some(Boolean)) return;

    setSubmitting(true);
    try {
      const res = await fetch("/api/vendor/email/request-change", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newEmail, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not change email");
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not change email");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-[10px] border border-brown/10 bg-cream p-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="label-caps mb-1">{locale === "ar" ? "البريد الإلكتروني" : "Email Address"}</p>
          <p className="text-sm text-brown-dark">{currentEmail}</p>
        </div>
        {!open && (
          <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
            {locale === "ar" ? "تغيير البريد الإلكتروني" : "Change Email"}
          </Button>
        )}
      </div>

      {open && (
        <div className="mt-5 pt-5 border-t border-brown/10">
          {sent ? (
            <div className="text-sm">
              <p className="text-brown-dark">
                {locale === "ar"
                  ? `أرسلنا رابط تأكيد إلى ${newEmail}. بريد الدخول لن يتغيّر حتى تفتح هذا الرابط.`
                  : `We've sent a confirmation link to ${newEmail}. Your login email won't change until you open it.`}
              </p>
              <button type="button" onClick={reset} className="mt-3 text-sm underline text-brown-light hover:text-brown-dark">
                {locale === "ar" ? "إغلاق" : "Close"}
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4 max-w-sm">
              <label className="flex flex-col gap-1 text-sm">
                {locale === "ar" ? "البريد الإلكتروني الجديد" : "New email"}
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => {
                    setNewEmail(e.target.value);
                    if (errors.newEmail) setErrors((p) => ({ ...p, newEmail: undefined }));
                  }}
                  autoComplete="email"
                  aria-invalid={!!errors.newEmail}
                  className={`border rounded-lg px-3 py-2 bg-cream-soft ${errors.newEmail ? fieldErrorRingClass : "border-brown/20"}`}
                />
                <FieldError message={errors.newEmail} />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                {locale === "ar" ? "تأكيد البريد الإلكتروني الجديد" : "Confirm new email"}
                <input
                  type="email"
                  value={confirmEmail}
                  onChange={(e) => {
                    setConfirmEmail(e.target.value);
                    if (errors.confirmEmail) setErrors((p) => ({ ...p, confirmEmail: undefined }));
                  }}
                  autoComplete="email"
                  aria-invalid={!!errors.confirmEmail}
                  className={`border rounded-lg px-3 py-2 bg-cream-soft ${errors.confirmEmail ? fieldErrorRingClass : "border-brown/20"}`}
                />
                <FieldError message={errors.confirmEmail} />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                {locale === "ar" ? "كلمة المرور الحالية" : "Current password"}
                <input
                  type="password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (errors.password) setErrors((p) => ({ ...p, password: undefined }));
                  }}
                  autoComplete="current-password"
                  aria-invalid={!!errors.password}
                  className={`border rounded-lg px-3 py-2 bg-cream-soft ${errors.password ? fieldErrorRingClass : "border-brown/20"}`}
                />
                <FieldError message={errors.password} />
              </label>

              {error && <p className="text-sm text-red-700 dark:text-red-400">{error}</p>}

              <div className="flex gap-3">
                <Button type="submit" size="sm" loading={submitting}>
                  {locale === "ar" ? "إرسال رابط التأكيد" : "Send confirmation link"}
                </Button>
                <Button type="button" variant="secondary" size="sm" onClick={reset}>
                  {locale === "ar" ? "إلغاء" : "Cancel"}
                </Button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
