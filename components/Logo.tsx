// Placeholder wordmark built to match the described DAH logo direction (thin
// geometric caps with dash separators, Arabic mark beneath, small "EVENTS"
// caption) until the real logo file is dropped in. Swap for an <img>/<Image>
// pointing at the real asset in /public — see README "Branding".
export function Logo({ className = "" }: { className?: string }) {
  return (
    <div className={`inline-flex flex-col items-center leading-none select-none ${className}`}>
      <span className="font-heading font-light text-2xl tracking-[0.35em] text-brown">
        D&#8209;A&#8209;H
      </span>
      <span className="mt-1 text-[11px] tracking-[0.15em] text-brown-light" dir="rtl">
        دار الحي
      </span>
      <span className="mt-1 text-[9px] font-semibold tracking-[0.3em] text-brown-light">
        EVENTS
      </span>
    </div>
  );
}
