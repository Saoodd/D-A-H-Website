// The Dar Al Hay mark: a symmetric pointed arch (evoking traditional
// Emirati/Islamic architectural doorways) with a small diamond suspended
// in the gap between its two legs — hand-vectorized from the brand
// reference the user provided. Image attachments pasted into chat aren't
// retrievable as file bytes by this component's tooling, only viewable, so
// this is a faithful redraw by eye rather than the literal source file
// (the user was told this and asked for this approach explicitly). Fill
// uses currentColor so it inherits whatever text-color class is passed in
// via `className`, keeping it correct in both themes without extra work.
// If an exact vector/AI/EPS export of the original mark becomes available,
// swapping this path data for the real one is a drop-in improvement.
function LogoMark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 150" className={className} fill="currentColor">
      <path d="M18,148 C18,95 24,50 60,10 C52,48 46,95 44,148 Z" />
      <path d="M102,148 C102,95 96,50 60,10 C68,48 74,95 76,148 Z" />
      <path d="M60,84 L71,97 L60,110 L49,97 Z" />
    </svg>
  );
}

interface LogoProps {
  /** "full" (default) renders the mark plus the DAR AL HAY / دار الحي /
   *  EVENTS wordmark stack — use wherever there's room (header, footer,
   *  auth pages, receipts). "mark" renders just the glyph — use at small
   *  sizes or where a text lockup would be redundant/cramped (compact nav
   *  chrome, favicon-equivalent contexts). */
  variant?: "full" | "mark";
  className?: string;
}

export function Logo({ variant = "full", className = "" }: LogoProps) {
  if (variant === "mark") {
    return <LogoMark className={`w-8 h-auto text-brown-dark ${className}`} />;
  }

  return (
    <div className={`inline-flex flex-col items-center leading-none select-none ${className}`}>
      <LogoMark className="w-14 h-auto text-brown-dark" />
      <span className="mt-2.5 text-sm tracking-[0.28em] text-brown-dark font-heading">
        DAR AL HAY
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
