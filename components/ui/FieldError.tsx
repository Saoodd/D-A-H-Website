// Shared inline field-error presentation — every form on the platform uses
// this instead of native browser validation bubbles ("Please match the
// requested format"), which don't match the DAH brand and can't explain WHY
// or HOW to fix an input. Pair with `noValidate` on the <form> and a
// lib/clientValidation.ts check on submit; the server (zod) stays the
// authority — this is a UX layer only.
export function FieldError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-xs text-red-700 dark:text-red-400 mt-1">
      {message}
    </p>
  );
}

// Applied to an input's className alongside its normal border classes when
// that field currently has an error — a subtle red ring/border, not a harsh
// red fill, so it reads as "please check this" rather than "you broke it."
export const fieldErrorRingClass = "border-red-400 dark:border-red-500/70 focus:ring-red-400 focus:border-red-400";
