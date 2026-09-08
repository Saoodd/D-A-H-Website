import { forwardRef } from "react";
import Link from "next/link";

type Variant = "primary" | "secondary" | "ghost" | "destructive";
type Size = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 rounded-[6px] font-medium tracking-wide transition-colors disabled:opacity-40 disabled:pointer-events-none whitespace-nowrap";

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
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
      {...rest}
    >
      {loading ? "…" : children}
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
