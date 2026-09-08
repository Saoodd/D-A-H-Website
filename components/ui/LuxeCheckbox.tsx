/** A refined checkbox for agreement/acceptance moments — a real, accessible
 *  native checkbox (visually hidden but still keyboard/screen-reader
 *  operable, still fully subject to `required`), paired with a custom
 *  bordered box + checkmark drawn from the DAH palette instead of the
 *  browser's default control. Purely visual: checked state, onChange,
 *  required and disabled all behave exactly like a plain <input
 *  type="checkbox">, so nothing about validation changes by using this. */
export function LuxeCheckbox({
  checked,
  onChange,
  required,
  disabled,
  className = "",
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  required?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <span className={`relative inline-flex shrink-0 ${className}`}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        required={required}
        disabled={disabled}
        className="peer sr-only"
      />
      <span
        aria-hidden="true"
        className="block w-5 h-5 rounded-[6px] border border-brown/35 bg-cream-soft peer-checked:bg-brown peer-checked:border-brown peer-disabled:opacity-40 peer-focus-visible:ring-2 peer-focus-visible:ring-brown/40 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-cream transition-colors"
      />
      <svg
        aria-hidden="true"
        viewBox="0 0 16 16"
        className="absolute inset-0 m-auto w-3 h-3 text-cream-soft opacity-0 peer-checked:opacity-100 transition-opacity pointer-events-none"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M3 8.2 6.2 11.5 13 4.5" />
      </svg>
    </span>
  );
}
