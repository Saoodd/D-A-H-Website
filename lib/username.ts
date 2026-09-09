export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 30;

// Letters, numbers, underscore — no spaces, no other punctuation. Case is
// preserved for display but never matters for identity (see normalize()).
const USERNAME_PATTERN = /^[a-zA-Z0-9_]+$/;

/** Trims outer whitespace only — this is what gets stored/shown as the
 *  vendor's chosen display casing ("SaeedStore" stays "SaeedStore"). */
export function trimUsername(raw: string): string {
  return raw.trim();
}

/** The canonical, case-insensitive identity of a username: trimmed and
 *  lowercased. This — never the display value — is what uniqueness and
 *  login lookups are keyed on, so "SaeedStore", "saeedstore" and
 *  " SaeedStore " all resolve to the same account. */
export function normalizeUsername(raw: string): string {
  return trimUsername(raw).toLowerCase();
}

export function isValidUsernameFormat(raw: string): boolean {
  const trimmed = trimUsername(raw);
  if (trimmed.length < USERNAME_MIN_LENGTH || trimmed.length > USERNAME_MAX_LENGTH) return false;
  return USERNAME_PATTERN.test(trimmed);
}

export const USERNAME_FORMAT_HINT = `${USERNAME_MIN_LENGTH}-${USERNAME_MAX_LENGTH} characters — letters, numbers and underscores only, no spaces.`;
