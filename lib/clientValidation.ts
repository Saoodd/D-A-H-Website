// Client-side validation used ONLY to improve UX (instant, on-brand error
// text under the relevant field) — the server (zod schemas in
// lib/validation.ts) remains the sole authority. Every check here mirrors a
// real server-side rule; a form field can never be *more* permissive here
// than what the API actually accepts.
import { USERNAME_FORMAT_HINT, isValidUsernameFormat } from "./username";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Deliberately loose — DAH serves an international vendor base, so this
// only rejects obviously-not-a-phone-number input (too short, letters),
// not a specific country format.
const PHONE_PATTERN = /^[+0-9()\-\s]{6,30}$/;

export function validateUsername(raw: string): string | null {
  if (!raw.trim()) return "Please enter a username.";
  if (!isValidUsernameFormat(raw)) return `Usernames can only contain letters, numbers and underscores. ${USERNAME_FORMAT_HINT}`;
  return null;
}

export function validateEmail(raw: string): string | null {
  if (!raw.trim()) return "Please enter your email address.";
  if (!EMAIL_PATTERN.test(raw.trim())) return "Enter a valid email address.";
  return null;
}

export function validatePassword(raw: string, minLength = 8): string | null {
  if (!raw) return "Please enter a password.";
  if (raw.length < minLength) return `Password must be at least ${minLength} characters.`;
  return null;
}

export function validatePasswordConfirmation(password: string, confirm: string): string | null {
  if (!confirm) return "Please confirm your password.";
  if (password !== confirm) return "Passwords do not match.";
  return null;
}

export function validatePhone(raw: string): string | null {
  if (!raw.trim()) return "Please enter your phone number.";
  if (!PHONE_PATTERN.test(raw.trim())) return "Enter a valid phone number.";
  return null;
}

export function validateRequired(raw: string, fieldLabel: string): string | null {
  if (!raw.trim()) return `Please enter your ${fieldLabel}.`;
  return null;
}

export function validateTermsAccepted(accepted: boolean): string | null {
  if (!accepted) return "You need to accept the Terms & Conditions before creating your account.";
  return null;
}

// Maps a raw server/API error string to the field it most likely belongs
// to, so a caught API error can still render inline (under the field)
// rather than only as a generic banner. Falls back to null (caller shows
// the message as a general/banner error) when nothing matches — this never
// invents a field, it only routes an already-safe, already-generic message
// the server chose to send.
export function guessErrorField(message: string): string | null {
  const m = message.toLowerCase();
  if (m.includes("username")) return "username";
  if (m.includes("email")) return "email";
  if (m.includes("password")) return "password";
  if (m.includes("phone")) return "phone";
  if (m.includes("terms")) return "terms";
  return null;
}
