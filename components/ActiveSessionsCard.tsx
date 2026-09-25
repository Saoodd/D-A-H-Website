"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import type { SessionRow } from "@/lib/sessionList";

/** Active sessions with per-device sign-out and "sign out everywhere
 *  else". Shared by the vendor profile and the admin settings page; each
 *  passes its own API base path and, for vendors, the locale. */
export function ActiveSessionsCard({
  sessions,
  apiBase,
  locale = "en",
  signedOutRedirect,
}: {
  sessions: SessionRow[];
  /** e.g. "/api/vendor/sessions" — POST {apiBase}/{id}/revoke and {apiBase}/revoke-others */
  apiBase: string;
  locale?: "en" | "ar";
  /** Where to go after revoking the current session. */
  signedOutRedirect: string;
}) {
  const router = useRouter();
  const isAr = locale === "ar";
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const others = sessions.filter((s) => !s.current).length;

  const fmt = (iso: string) =>
    new Date(iso).toLocaleString(isAr ? "ar-AE" : "en-AE", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

  async function post(key: string, path: string) {
    setBusy(key);
    setError(null);
    try {
      const res = await fetch(path, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed");
      if (data.signedOut) {
        router.push(signedOutRedirect);
        return;
      }
      router.refresh();
    } catch {
      setError(isAr ? "تعذر تسجيل الخروج. حاول مرة أخرى." : "Couldn't sign that session out. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="rounded-xl border border-brown/10 bg-cream-soft/70 p-5">
      <ul className="divide-y divide-brown/10">
        {sessions.map((s) => (
          <li key={s.id} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
            <div className="min-w-0">
              <p className="text-sm text-brown-dark">
                {s.device ?? (isAr ? "جهاز غير معروف" : "Unknown device")}
                {s.current && (
                  <span className="ms-2 text-[11px] uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
                    {isAr ? "هذا الجهاز" : "This device"}
                  </span>
                )}
              </p>
              <p className="text-xs text-brown-light mt-0.5">
                {s.lastSeenAt
                  ? `${isAr ? "آخر نشاط" : "Last active"} ${fmt(s.lastSeenAt)}`
                  : `${isAr ? "تسجيل الدخول" : "Signed in"} ${fmt(s.createdAt)}`}
              </p>
            </div>
            <Button
              variant={s.current ? "ghost" : "secondary"}
              size="sm"
              loading={busy === s.id}
              disabled={busy !== null}
              onClick={() => post(s.id, `${apiBase}/${s.id}/revoke`)}
            >
              {s.current ? (isAr ? "تسجيل الخروج" : "Sign out") : isAr ? "إنهاء الجلسة" : "Sign out device"}
            </Button>
          </li>
        ))}
      </ul>
      {others > 0 && (
        <div className="mt-4 pt-4 border-t border-brown/10">
          <Button variant="destructive" size="sm" loading={busy === "others"} disabled={busy !== null} onClick={() => post("others", `${apiBase}/revoke-others`)}>
            {isAr ? `تسجيل الخروج من جميع الأجهزة الأخرى (${others})` : `Sign out of all other devices (${others})`}
          </Button>
        </div>
      )}
      {error && (
        <p className="mt-3 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
