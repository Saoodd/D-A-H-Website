import { redirect } from "next/navigation";

// Email verification no longer exists — this route only remains so a
// previously-sent "Verify email" link (already delivered before this
// change) doesn't 404. Any ?token= is simply ignored.
export default function VerifyEmailLinkPage() {
  redirect("/vendor/profile");
}
