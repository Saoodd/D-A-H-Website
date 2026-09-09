"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/lib/i18n/context";
import { Button } from "@/components/ui/Button";
import { FieldError, fieldErrorRingClass } from "@/components/ui/FieldError";

// Closing an account is deliberately not a one-click action: the vendor
// must re-enter their password AND type their own username to confirm,
// and the server independently blocks closure while there's an active
// booking or unresolved request (see /api/vendor/account DELETE).
export function DeleteAccountCard({ username }: { username: string }) {
  const { locale } = useLocale();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [errors, setErrors] = useState<{ password?: string; confirmation?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const nextErrors: typeof errors = {
      password: password ? undefined : locale === "ar" ? "يرجى إدخال كلمة المرور." : "Please enter your password.",
      confirmation:
        confirmation.trim().toLowerCase() === username.toLowerCase()
          ? undefined
          : locale === "ar"
          ? `اكتب اسم المستخدم (${username}) بالضبط للتأكيد.`
          : `Type your username (${username}) exactly to confirm.`,
    };
    setErrors(nextErrors);
    if (Object.values(nextErrors).some(Boolean)) return;

    if (!window.confirm(locale === "ar" ? "هذا الإجراء نهائي. هل أنت متأكد من إغلاق حسابك؟" : "This is final. Are you sure you want to close your account?")) {
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/vendor/account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, confirmation }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not close account");
      router.push("/vendor/login");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not close account");
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-[10px] border border-red-300/50 bg-red-50/50 dark:bg-red-950/10 p-6">
      <p className="label-caps text-red-800 dark:text-red-400 mb-1">{locale === "ar" ? "منطقة الخطر" : "Danger Zone"}</p>
      <p className="text-sm text-brown-light mb-4">
        {locale === "ar"
          ? "إغلاق حسابك يزيل قدرتك على تسجيل الدخول وبياناتك الشخصية. السجلات التي تتطلبها دار الحي قانونياً — الاتفاقيات الموقعة والمدفوعات والحجوزات — تبقى محفوظة."
          : "Closing your account removes your login access and personal details. Records DAH is legally required to retain — signed agreements, payments and bookings — stay on file."}
      </p>

      {!open ? (
        <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
          {locale === "ar" ? "حذف الحساب" : "Delete Account"}
        </Button>
      ) : (
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4 max-w-sm">
          <label className="flex flex-col gap-1 text-sm">
            {locale === "ar" ? "كلمة المرور" : "Password"}
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
          <label className="flex flex-col gap-1 text-sm">
            {locale === "ar" ? `اكتب اسم المستخدم (${username}) للتأكيد` : `Type your username (${username}) to confirm`}
            <input
              value={confirmation}
              onChange={(e) => {
                setConfirmation(e.target.value);
                if (errors.confirmation) setErrors((p) => ({ ...p, confirmation: undefined }));
              }}
              aria-invalid={!!errors.confirmation}
              className={`border rounded-lg px-3 py-2 bg-cream-soft ${errors.confirmation ? fieldErrorRingClass : "border-brown/20"}`}
            />
            <FieldError message={errors.confirmation} />
          </label>

          {error && <p className="text-sm text-red-700 dark:text-red-400">{error}</p>}

          <div className="flex gap-3">
            <Button type="submit" variant="destructive" size="sm" loading={submitting}>
              {locale === "ar" ? "تأكيد حذف الحساب" : "Confirm Account Deletion"}
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(false)}>
              {locale === "ar" ? "إلغاء" : "Cancel"}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
