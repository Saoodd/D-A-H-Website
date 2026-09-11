import "server-only";
import { NextResponse } from "next/server";
import { prisma } from "./prisma";
import { normalizePhoneToE164 } from "./phone";
import type { Vendor } from "@prisma/client";

// Account verification (email + mobile) is a separate concept from
// Vendor.verified (DAH's manual business-verification step) and from
// profile completion — see PART 19/20 of the spec. Both of the checks below
// must be true before a vendor can apply/book.

export function isEmailVerified(vendor: Pick<Vendor, "emailVerifiedAt">): boolean {
  return !!vendor.emailVerifiedAt;
}

/** True only when the vendor has a verified phone AND that verification
 *  still matches their CURRENT phone number — editing the phone (profile
 *  update, admin edit, anything) automatically falls back to unverified the
 *  moment the stored `phoneVerifiedNumber` snapshot stops matching, with no
 *  extra code needed at each edit site to remember to clear a flag. */
export function isPhoneVerified(vendor: Pick<Vendor, "phone" | "phoneVerifiedAt" | "phoneVerifiedNumber">): boolean {
  if (!vendor.phoneVerifiedAt || !vendor.phoneVerifiedNumber) return false;
  const currentNormalized = normalizePhoneToE164(vendor.phone);
  return currentNormalized !== null && currentNormalized === vendor.phoneVerifiedNumber;
}

export const VERIFICATION_REQUIRED_MESSAGE = "Please verify your mobile number before continuing.";

type VerificationGateResult =
  | { ok: true; vendor: Vendor }
  | { ok: false; response: NextResponse };

/** Shared server-side gate for every action that requires a verified
 *  vendor (submit application, select/confirm a booth, accept event terms,
 *  start/complete payment). Phone verification is the eligibility
 *  requirement — email verification is intentionally NOT checked here: an
 *  account's email is a normal account-communication channel (login,
 *  password reset, receipts) and never blocks event participation. Always
 *  re-reads the vendor fresh from the DB — never trusts a session or a
 *  client-supplied flag — and returns a structured 403 (not a bare
 *  "Unauthorized") so the client can render an inline verification prompt
 *  instead of a raw error. */
export async function requirePhoneVerifiedVendor(vendorId: string): Promise<VerificationGateResult> {
  const vendor = await prisma.vendor.findUnique({ where: { id: vendorId } });
  if (!vendor || vendor.accountStatus !== "ACTIVE") {
    return { ok: false, response: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  }

  const phoneVerified = isPhoneVerified(vendor);
  if (!phoneVerified) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: VERIFICATION_REQUIRED_MESSAGE, code: "VERIFICATION_REQUIRED", phoneVerified: false },
        { status: 403 }
      ),
    };
  }

  return { ok: true, vendor };
}
