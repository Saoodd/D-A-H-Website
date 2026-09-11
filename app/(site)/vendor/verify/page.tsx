import { redirect } from "next/navigation";

// The old dual email+phone "Verify Your Account" page is retired — email
// verification no longer exists as a concept, and phone verification now
// happens inline via PhoneVerifyModal wherever it's actually needed (Apply,
// booth selection, event terms, Profile). This route stays only so any
// stale bookmark or old link still lands somewhere useful instead of a 404.
export default function VerifyAccountPage() {
  redirect("/vendor/profile");
}
