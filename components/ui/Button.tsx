import { forwardRef } from "react";
import Link from "next/link";

type Variant = "primary" | "secondary" | "ghost" | "destructive";
type Size = "sm" | "md" | "lg";

// cursor-pointer/disabled:cursor-not-allowed here because <button> has no
// pointer cursor by default in any browser (unlike <a>) — this was missing
// sitewide. The press/scale feedback itself is NOT set here; it comes from
// the global button:active rule in globals.css, which also respects
// prefers-reduced-motion in one place instead of duplicating that guard
// across every component that uses this button.
const base =
  "inline-flex items-center justify-center gap-2 rounded-[6px] font-medium tracking-wide transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-40 disabled:pointer-events-none whitespace-nowrap";

const variants: Record<Variant, string> = {
  primary: "bg-brown text-cream-soft hover:bg-brown-dark",
  secondary: "border border-brown/25 text-brown-dark hover:bg-brown/5",
  ghost: "text-brown-dark hover:bg-brown/5",
  destructive: "border border-red-800/30 text-red-800 hover:bg-red-800/5 dark:text-red-300 dark:border-red-300/30",
};

const sizes: Record<Size, string> = {
  sm: "px-3.5 py-1.5 text-xs",
  md: "px-5 py-2.5 text-sm",
  lg: "px-7 py-3 text-sm",
};

// Small inline spinner used only when `loading` is true. Sized off the
// current font-size (1em) so it scales naturally with the sm/md/lg text
// sizes above without its own size prop.
function Spinner() {
  return (
    <svg
      className="h-[1em] w-[1em] shrink-0 animate-spin motion-reduce:animate-none"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
      <path className="opacity-90" d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

interface ButtonOwnProps {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  className?: string;
}

type ButtonProps = ButtonOwnProps & React.ButtonHTMLAttributes<HTMLButtonElement>;

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", loading, disabled, className = "", children, ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
      {...rest}
    >
      {/* Keep the label on screen while loading (dimmed, spinner in front)
          instead of swapping it for an ellipsis — the button never changes
          width mid-click and the user still sees what they're waiting on. */}
      {loading && <Spinner />}
      <span className={loading ? "opacity-70" : undefined}>{children}</span>
    </button>
  );
});

interface LinkButtonProps extends ButtonOwnProps {
  href: string;
  children: React.ReactNode;
  target?: string;
  rel?: string;
}

/** Same visual system as Button, for navigational actions that should be a
 *  real link (crawlable, openable in a new tab, no JS required to work). */
export function LinkButton({ href, variant = "primary", size = "md", className = "", children, ...rest }: LinkButtonProps) {
  return (
    <Link href={href} className={`${base} ${variants[variant]} ${sizes[size]} ${className}`} {...rest}>
      {children}
    </Link>
  );
}
