"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/Button";

export function AdminLoginClient() {
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
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: form.get("password") }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Login failed");
      }
      router.push("/admin");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-cream-soft px-4">
      <Link href="/" className="mb-10">
        <Logo />
      </Link>
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm bg-cream border border-brown/10 rounded-[10px] p-8 shadow-[0_1px_3px_rgba(0,0,0,0.06)]"
      >
        <p className="text-xs tracking-[0.3em] uppercase text-brown-light mb-1">DAH — Management Portal</p>
        <h1 className="font-heading text-2xl text-brown-dark mb-6">Sign in</h1>
        <label className="flex flex-col gap-1 text-sm mb-4">
          Password
          <span className="relative flex items-center">
            <input
              name="password"
              type={showPassword ? "text" : "password"}
              required
              autoFocus
              autoComplete="current-password"
              className="w-full border border-brown/20 rounded-lg px-3 py-2.5 pe-16 bg-cream-soft focus:outline-none focus:ring-1 focus:ring-brown"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute end-3 text-xs text-brown-light hover:text-brown"
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          </span>
        </label>
        {error && (
          <p role="alert" className="text-sm text-red-700 mb-3">
            {error}
          </p>
        )}
        <Button type="submit" loading={submitting} className="w-full">
          Log in
        </Button>
      </form>
      <Link href="/" className="mt-8 text-xs text-brown-light hover:text-brown underline">
        Back to site
      </Link>
    </main>
  );
}
