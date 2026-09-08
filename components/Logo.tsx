import Image from "next/image";

// Drop the real DAH mark at public/logo.svg (or .png, transparent
// background) and flip this to true — everywhere <Logo /> is used
// (header, footer, admin login) picks it up automatically, sized by the
// `className` passed at each call site. Until then this renders the
// wordmark fallback below so the site still has a usable mark.
const HAS_REAL_LOGO_ASSET = false;
const LOGO_SRC = "/logo.svg";

export function Logo({ className = "" }: { className?: string }) {
  if (HAS_REAL_LOGO_ASSET) {
    return <Image src={LOGO_SRC} alt="Dar Al Hay" width={160} height={48} className={className} priority />;
  }

  return (
    <div className={`inline-flex flex-col items-center leading-none select-none ${className}`}>
      <span className="font-heading font-light text-2xl tracking-[0.35em] text-brown-dark">
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
