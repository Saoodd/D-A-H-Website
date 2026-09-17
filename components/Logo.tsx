import Image from "next/image";

// The real Dar Al Hay brand mark — sourced directly from the supplied
// brand artwork (public/brand/logo-{dark,light}{,-sm,-lg}.png), not a
// redraw. "dark" = the olive-circle/ivory-mark badge, used against the
// app's light theme (ivory page background) for contrast; "light" = the
// cream-circle/dark-mark badge, used against the app's dark theme
// (charcoal page background). Swapped via plain CSS (.theme-light-only /
// .theme-dark-only in globals.css) keyed off [data-theme], not a client
// hook, so this stays usable in server-rendered contexts (e.g. the
// printable receipt page) with no hydration mismatch.
interface LogoProps {
  /** "full" (default) — the badge at a size where its baked-in DAR AL
   *  HAY / دار الحي / EVENTS wordmark reads clearly. "mark" — the same
   *  badge at a smaller size, for compact chrome (mobile top bars). Both
   *  variants show the same artwork; there is no separate icon-only
   *  export, so "mark" is simply a smaller rendering of the full badge. */
  variant?: "full" | "mark";
  className?: string;
}

export function Logo({ variant = "full", className = "" }: LogoProps) {
  const px = variant === "full" ? 72 : 32;
  const srcSize = variant === "full" ? "" : "-sm";

  return (
    <span className={`inline-flex items-center ${className}`}>
      <Image
        src={`/brand/logo-dark${srcSize}.png`}
        alt="Dar Al Hay"
        width={px}
        height={px}
        className="theme-light-only rounded-full"
        priority
      />
      <Image
        src={`/brand/logo-light${srcSize}.png`}
        alt="Dar Al Hay"
        width={px}
        height={px}
        className="theme-dark-only rounded-full"
        priority
      />
    </span>
  );
}
