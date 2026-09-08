import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-[70vh] flex items-center justify-center bg-cream-soft text-ink">
      <div className="text-center px-6">
        <p className="text-xs tracking-[0.35em] uppercase text-brown-light mb-4">Dar Al Hay</p>
        <h1 className="text-5xl font-heading font-light mb-4">404</h1>
        <p className="text-brown-light mb-8">This page doesn&rsquo;t exist — it may have moved or been renamed.</p>
        <Link
          href="/"
          className="inline-block px-6 py-2.5 rounded-full bg-brown text-cream-soft text-sm hover:opacity-90"
        >
          Back to home
        </Link>
      </div>
    </div>
  );
}
