import { redirect } from "next/navigation";

// The old dual email+phone "Verify Your Account" page is retired. Phone
// verification (the one real eligibility gate) happens inline via
// PhoneVerifyModal wherever it's actually needed (Apply, booth selection,
// event terms, Profile). Email verification exists as an optional,
// non-gating account detail with no dedicated page of its own — see
// /vendor/verify/email for the confirm-link landing page. This route stays
// only so any stale bookmark or old link still lands somewhere useful
// instead of a 404.
export default function VerifyAccountPage() {
  redirect("/vendor/profile");
}
