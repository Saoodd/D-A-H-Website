import Image from "next/image";

// The real Dar Al Hay brand mark + wordmark — sourced directly from the
// supplied brand artwork (public/brand/logo-{dark,light}{,-sm,-lg}.png),
// background and circular badge removed (kept only for the favicon/OG
// image, where a self-contained badge reads better) so the ink-colored
// mark sits directly on the page like a normal logo. "dark" = the olive
// ink version, used against the app's light theme (ivory page
// background); "light" = the ivory ink version, used against the app's
// dark theme (charcoal page background). Swapped via plain CSS
// (.theme-light-only / .theme-dark-only in globals.css) keyed off
// [data-theme], not a client hook, so this stays usable in
// server-rendered contexts (e.g. the printable receipt page) with no
// hydration mismatch.
interface LogoProps {
  /** "full" (default) — the mark + full wordmark (DAR AL HAY / دار الحي /
   *  EVENTS) at a size where it reads clearly. "mark" — the same artwork
   *  at a smaller size, for compact chrome (mobile top bars). */
  variant?: "full" | "mark";
  className?: string;
}

// Intrinsic pixel size of each source file, for correct aspect ratio —
// display size is controlled by the h-* utility in `heightClass` (w-auto
// lets each variant keep its own natural width at that height).
const DIMENSIONS = {
  full: { dark: { w: 264, h: 300 }, light: { w: 299, h: 300 } },
  mark: { dark: { w: 88, h: 100 }, light: { w: 100, h: 100 } },
} as const;

export function Logo({ variant = "full", className = "" }: LogoProps) {
  const suffix = variant === "mark" ? "-sm" : "";
  const heightClass = variant === "mark" ? "h-10 w-auto" : "h-24 w-auto";
  const dims = DIMENSIONS[variant];

  return (
    <span className={`inline-flex items-center ${className}`}>
      <Image
        src={`/brand/logo-dark${suffix}.png`}
        alt="Dar Al Hay"
        width={dims.dark.w}
        height={dims.dark.h}
        className={`theme-light-only ${heightClass}`}
        priority
      />
      <Image
        src={`/brand/logo-light${suffix}.png`}
        alt="Dar Al Hay"
        width={dims.light.w}
        height={dims.light.h}
        className={`theme-dark-only ${heightClass}`}
        priority
      />
    </span>
  );
}
