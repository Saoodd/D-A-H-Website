"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Logo } from "@/components/Logo";

export function AdminLoginClient() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-cream-soft px-4">
      <Link href="/" className="mb-10">
        <Logo />
      </Link>
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm bg-cream border border-brown/10 rounded-2xl p-8 shadow-[0_1px_3px_rgba(0,0,0,0.06)]"
      >
        <p className="text-xs tracking-[0.3em] uppercase text-brown-light mb-1">Admin</p>
        <h1 className="font-heading text-2xl text-brown-dark mb-6">Sign in</h1>
        <label className="flex flex-col gap-1 text-sm mb-4">
          Password
          <input
            name="password"
            type="password"
            required
            autoFocus
            className="border border-brown/20 rounded-lg px-3 py-2.5 bg-cream-soft focus:outline-none focus:ring-1 focus:ring-brown"
          />
        </label>
        {error && <p className="text-sm text-red-700 mb-3">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="w-full py-2.5 rounded-full bg-brown text-cream-soft text-sm tracking-wide hover:bg-brown-dark transition-colors disabled:opacity-50"
        >
          {submitting ? "…" : "Log in"}
        </button>
      </form>
      <Link href="/" className="mt-8 text-xs text-brown-light hover:text-brown underline">
        Back to site
      </Link>
    </div>
  );
}
