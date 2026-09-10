import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { getVendorSession, verifyPassword, destroyVendorSession, hashPassword, invalidateAllVendorSessions } from "@/lib/auth";
import { deleteAccountSchema } from "@/lib/validation";
import { rateLimit, clientIp } from "@/lib/rateLimit";
import { sendAccountClosedEmail } from "@/lib/email";

// Closing an account is a soft-delete: the Vendor row stays (agreements,
// payments and bookings all reference it, and it must keep reserving its
// email/username so those identifiers can never be immediately reused),
// but login is disabled and non-required personal/profile data is cleared.
export async function DELETE(req: NextRequest) {
  const session = await getVendorSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ip = clientIp(req.headers);
  if (!rateLimit(`account-delete:${session.vendorId}`, 5, 15 * 60 * 1000) || !rateLimit(`account-delete-ip:${ip}`, 10, 15 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many attempts. Please try again later." }, { status: 429 });
  }

  const json = await req.json().catch(() => null);
  const parsed = deleteAccountSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Please check the form and try again." }, { status: 400 });

  const vendor = await prisma.vendor.findUnique({ where: { id: session.vendorId } });
  if (!vendor || vendor.accountStatus !== "ACTIVE") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!(await verifyPassword(parsed.data.password, vendor.passwordHash))) {
    return NextResponse.json({ error: "Incorrect password." }, { status: 401 });
  }

  if (parsed.data.confirmation.trim().toLowerCase() !== vendor.username.toLowerCase()) {
    return NextResponse.json({ error: `Type your username (${vendor.username}) exactly to confirm.` }, { status: 400 });
  }

  // Block closure while there's an active, unresolved relationship with
  // DAH — an accepted application for a future event (paid or not, since
  // an unpaid acceptance still holds a booth) or a cancellation request DAH
  // hasn't processed yet.
  const [upcomingAccepted, unresolvedCancellation] = await Promise.all([
    prisma.application.findFirst({
      where: { vendorId: vendor.id, status: "ACCEPTED", event: { startDate: { gte: new Date() } } },
      select: { id: true },
    }),
    prisma.cancellationRequest.findFirst({
      where: { status: "PENDING", application: { vendorId: vendor.id } },
      select: { id: true },
    }),
  ]);

  if (upcomingAccepted || unresolvedCancellation) {
    return NextResponse.json(
      {
        error:
          "You have an upcoming event booking or an unresolved request on file, so your account can't be closed automatically. Please contact DAH to resolve this first.",
      },
      { status: 409 }
    );
  }

  const unusablePasswordHash = await hashPassword(randomBytes(24).toString("hex"));

  await prisma.vendor.update({
    where: { id: vendor.id },
    data: {
      accountStatus: "CLOSED",
      closedAt: new Date(),
      passwordHash: unusablePasswordHash,
      contactName: "Former vendor",
      phone: "",
      instagram: null,
      website: null,
      description: "",
      logoUrl: null,
      tradeLicenseNumber: null,
      tradeLicenseFileUrl: null,
      tradeLicenseExpiry: null,
    },
  });

  // Kill every session for this account, not just the one used to close
  // it — a closed account shouldn't leave another open browser tab/device
  // still authenticated.
  await invalidateAllVendorSessions(vendor.id);
  await destroyVendorSession();

  await sendAccountClosedEmail({ vendorEmail: vendor.email, businessName: vendor.businessName });

  return NextResponse.json({ ok: true });
}
