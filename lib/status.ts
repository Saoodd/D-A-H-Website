import { DisplayStatus } from "./constants";

// The single authoritative status computation — every page/list that shows
// a booking's status (vendor Overview, vendor Applications list, vendor
// Application Detail, admin Applications) calls this exact function, never
// a second copy. `hasSucceededPayment` must always be derived fresh from
// the Payment table (never a stored/cached flag) — see call sites.
export function getDisplayStatus(
  application: { status: string },
  hasSucceededPayment: boolean
): DisplayStatus {
  // A genuinely succeeded payment is the one unambiguous ground truth for
  // "this booking is confirmed" — checked FIRST, unconditionally, so it
  // always overrides `application.status` rather than the other way
  // around. `acceptanceExpiresAt` passing is supposed to only matter while
  // payment is still outstanding; once a payment has actually succeeded,
  // that deadline is irrelevant and must never downgrade the booking back
  // to "expired" (see lib/expiry.ts, which now also excludes paid
  // applications from its own sweep — this check is deliberate
  // belt-and-braces so even a future regression there can't resurface this
  // as a display bug).
  if (hasSucceededPayment) return "PAID";
  if (application.status === "PENDING") return "PENDING";
  if (application.status === "REJECTED") return "REJECTED";
  if (application.status === "ACCEPTANCE_EXPIRED") return "EXPIRED";
  if (application.status === "ACCEPTED") return "ACCEPTED_UNPAID";
  return "PENDING";
}
