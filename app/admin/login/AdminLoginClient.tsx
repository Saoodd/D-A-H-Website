"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

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
    <div className="min-h-screen flex items-center justify-center bg-cream-soft">
      <form onSubmit={handleSubmit} className="w-full max-w-sm bg-cream border border-brown/10 rounded-2xl p-8">
        <p className="text-xs tracking-[0.3em] uppercase text-brown-light mb-1">Dar Al Hay</p>
        <h1 className="font-heading text-2xl text-brown-dark mb-6">Admin Login</h1>
        <label className="flex flex-col gap-1 text-sm mb-4">
          Password
          <input
            name="password"
            type="password"
            required
            autoFocus
            className="border border-brown/20 rounded-lg px-3 py-2 bg-cream-soft"
          />
        </label>
        {error && <p className="text-sm text-red-700 mb-3">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="w-full py-2.5 rounded-full bg-brown text-cream-soft text-sm hover:bg-brown-dark disabled:opacity-50"
        >
          {submitting ? "…" : "Log in"}
        </button>
      </form>
    </div>
  );
}
