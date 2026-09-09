import { redirect } from "next/navigation";

// The combined Agreements hub was split into two dedicated areas — Signup
// Terms (the one permanent DAH account agreement) and Event Terms
// (organized per event) — so a bare /admin/agreements visit lands on the
// first of those rather than a hub that no longer exists.
export default function AdminAgreementsIndexPage() {
  redirect("/admin/agreements/signup");
}
