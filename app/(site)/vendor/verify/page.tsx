import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getVendorSession } from "@/lib/auth";
import { isEmailVerified, isPhoneVerified } from "@/lib/verification";
import { maskPhoneForDisplay, normalizePhoneToE164 } from "@/lib/phone";
import { VerifyAccountClient } from "./VerifyAccountClient";

export const metadata: Metadata = { title: "Verify Your Account" };

export default async function VerifyAccountPage() {
  const session = await getVendorSession();
  if (!session) redirect("/vendor/login?next=/vendor/verify");

  const vendor = await prisma.vendor.findUnique({ where: { id: session.vendorId } });
  if (!vendor || vendor.accountStatus !== "ACTIVE") redirect("/vendor/login");

  const normalizedPhone = normalizePhoneToE164(vendor.phone);
  const emailAlreadySent = !!(await prisma.emailVerificationToken.findFirst({ where: { vendorId: vendor.id }, select: { id: true } }));

  return (
    <VerifyAccountClient
      businessName={vendor.businessName}
      email={vendor.email}
      emailVerified={isEmailVerified(vendor)}
      emailAlreadySent={emailAlreadySent}
      phoneMasked={normalizedPhone ? maskPhoneForDisplay(normalizedPhone) : vendor.phone}
      phoneVerified={isPhoneVerified(vendor)}
      phoneUsable={!!normalizedPhone}
    />
  );
}
