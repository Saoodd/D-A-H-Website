type Tone = "neutral" | "positive" | "attention" | "negative" | "info";

// Functional status colors, reserved for actual state — never used as
// decoration. Kept deliberately muted (tinted background + matching text,
// no solid fills) so a table of these doesn't read as a rainbow.
const tones: Record<Tone, string> = {
  neutral: "bg-brown/8 text-brown-light",
  positive: "bg-emerald-700/10 text-emerald-800 dark:text-emerald-400",
  attention: "bg-amber-600/12 text-amber-800 dark:text-amber-400",
  negative: "bg-red-800/10 text-red-800 dark:text-red-400",
  info: "bg-sky-700/10 text-sky-800 dark:text-sky-400",
};

export function StatusBadge({ label, tone = "neutral", className = "" }: { label: string; tone?: Tone; className?: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-[4px] px-2 py-0.5 text-[11px] font-medium tracking-wide ${tones[tone]} ${className}`}
    >
      {label}
    </span>
  );
}
