// The real DAH mark: three geometric glyphs styled after Arabic
// architectural line-work (D as a stem + bowl arc, A as an open triangle
// with a crossbar, H as twin bars with a doubled rung), hand-vectorized
// from the brand reference the user provided — image attachments aren't
// retrievable as file bytes by this component's tooling, only viewable, so
// this is a faithful redraw rather than the literal source file. Stroke
// uses currentColor so it inherits whatever text-color class is passed in
// via `className`, keeping it correct in both themes without extra work.
// If an exact vector/AI/EPS export of the original mark becomes available,
// swapping this path data for the real one is a drop-in improvement.
function LogoMark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 306 120" className={className} fill="none" stroke="currentColor" strokeWidth={6} strokeLinecap="round" strokeLinejoin="round">
      {/* D */}
      <path d="M20 10 L20 110" />
      <path d="M20 10 A50 50 0 0 1 20 110" />
      {/* dash */}
      <path d="M85 60 L105 60" />
      {/* A — open triangle with a crossbar, no base line */}
      <path d="M155 10 L133 110" />
      <path d="M155 10 L177 110" />
      <path d="M144 68 L166 68" />
      {/* dash */}
      <path d="M205 60 L225 60" />
      {/* H — twin bars, doubled rung */}
      <path d="M240 10 L240 110" />
      <path d="M290 10 L290 110" />
      <path d="M240 52 L290 52" />
      <path d="M240 68 L290 68" />
    </svg>
  );
}

export function Logo({ className = "" }: { className?: string }) {
  return (
    <div className={`inline-flex flex-col items-center leading-none select-none ${className}`}>
      <LogoMark className="w-24 h-auto text-brown-dark" />
      <span className="mt-2 text-[11px] tracking-[0.15em] text-brown-light" dir="rtl">
        دار الحي
      </span>
      <span className="mt-1 text-[9px] font-semibold tracking-[0.3em] text-brown-light">
        EVENTS
      </span>
    </div>
  );
}
