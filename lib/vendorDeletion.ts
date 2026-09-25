import "server-only";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";
import { deletePublicBlobIfOwned } from "@/lib/blob";
import { deleteBlobIfOwned } from "@/lib/uploadSafety";

const DELETED_LABEL = "Deleted Vendor";

export class VendorAlreadyDeletedError extends Error {
  constructor() {
    super("This vendor has already been permanently removed.");
  }
}

export interface VendorDeletionResult {
  vendorId: string;
  hadSelfClosed: boolean;
  applicationsKept: number;
  applicationsPurged: number;
  blobsDeleted: number;
}

// The one entry point for admin-initiated permanent vendor removal (see
// app/api/admin/vendors/[id]/route.ts DELETE). Never called from any
// vendor-facing route — vendors can only self-close (app/api/vendor/account
// DELETE), which is a much softer, reversible-in-spirit state.
//
// The Vendor row itself is NEVER hard-deleted: AgreementAcceptance.vendorId
// cascades directly from Vendor (separate from its applicationId FK, which
// is SetNull), so a literal prisma.vendor.delete() would destroy every
// signed agreement this vendor ever accepted — exactly the "dangerous
// cascade" the deletion requirement explicitly forbids. Instead this
// anonymizes the row in place and marks it DELETED, which also keeps
// usernameLower permanently reserved (the row, and its unique index entry,
// never goes away) so the username can never be immediately reclaimed.
//
// Per Application, history is judged individually: an application with any
// Payment, AgreementAcceptance, Adjustment, or Booth hold/assignment
// referencing it is retained (kept row, PII snapshot fields anonymized) —
// anything genuinely history-free is hard-deleted outright. This is the
// line between removable account/profile data and immutable legal/
// financial history the deletion requirement draws.
export async function permanentlyRemoveVendor(vendorId: string): Promise<VendorDeletionResult> {
  const vendor = await prisma.vendor.findUnique({ where: { id: vendorId } });
  if (!vendor) throw new Error("Vendor not found.");
  if (vendor.accountStatus === "DELETED") throw new VendorAlreadyDeletedError();

  const hadSelfClosed = vendor.accountStatus === "CLOSED";

  const applications = await prisma.application.findMany({
    where: { vendorId },
    select: {
      id: true,
      _count: {
        select: { payments: true, agreementAcceptances: true, adjustments: true, heldBooths: true, assignedBooths: true },
      },
    },
  });

  const purgeIds: string[] = [];
  const keepIds: string[] = [];
  for (const app of applications) {
    const hasHistory =
      app._count.payments > 0 ||
      app._count.agreementAcceptances > 0 ||
      app._count.adjustments > 0 ||
      app._count.heldBooths > 0 ||
      app._count.assignedBooths > 0;
    (hasHistory ? keepIds : purgeIds).push(app.id);
  }

  const unusablePasswordHash = await hashPassword(randomBytes(24).toString("hex"));
  // Unique per vendor (never recycled — vendor.id never changes), so this
  // never collides with the email unique index, including against another
  // already-deleted vendor.
  const placeholderEmail = `deleted-${vendor.id}@deleted.dah.internal`;

  await prisma.$transaction([
    ...(purgeIds.length ? [prisma.application.deleteMany({ where: { id: { in: purgeIds } } })] : []),
    ...(keepIds.length
      ? [
          prisma.application.updateMany({
            where: { id: { in: keepIds } },
            data: { businessName: DELETED_LABEL, contactName: DELETED_LABEL, phone: "", email: placeholderEmail, instagram: null },
          }),
        ]
      : []),
    prisma.vendorSession.deleteMany({ where: { vendorId } }),
    prisma.vendorIdentity.deleteMany({ where: { vendorId } }),
    prisma.passwordResetToken.deleteMany({ where: { vendorId } }),
    prisma.emailChangeToken.deleteMany({ where: { vendorId } }),
    prisma.emailVerificationToken.deleteMany({ where: { vendorId } }),
    prisma.vendorPhoneVerificationLog.deleteMany({ where: { vendorId } }),
    prisma.vendorNote.deleteMany({ where: { vendorId } }),
    prisma.vendorWarning.deleteMany({ where: { vendorId } }),
    prisma.vendor.update({
      where: { id: vendorId },
      data: {
        accountStatus: "DELETED",
        permanentlyDeletedAt: new Date(),
        passwordHash: unusablePasswordHash,
        email: placeholderEmail,
        businessName: DELETED_LABEL,
        contactName: DELETED_LABEL,
        phone: "",
        description: "",
        instagram: null,
        website: null,
        logoUrl: null,
        tradeLicenseNumber: null,
        tradeLicenseFileUrl: null,
        tradeLicenseExpiry: null,
        emailVerifiedAt: null,
        phoneVerifiedAt: null,
        phoneVerifiedNumber: null,
        phoneVerifiedMethod: null,
        phoneOtpCodeHash: null,
        phoneOtpPhone: null,
        phoneOtpExpiresAt: null,
        phoneOtpAttempts: 0,
      },
    }),
  ]);

  // Blob deletion happens only after the DB transaction has actually
  // committed — a failed transaction must never leave a vendor's live logo
  // or trade-licence file deleted out from under a still-ACTIVE/CLOSED row.
  let blobsDeleted = 0;
  if (vendor.logoUrl) {
    await deletePublicBlobIfOwned(vendor.logoUrl);
    blobsDeleted++;
  }
  if (vendor.tradeLicenseFileUrl) {
    await deleteBlobIfOwned(vendor.tradeLicenseFileUrl);
    blobsDeleted++;
  }

  await prisma.adminAuditLog.create({
    data: {
      action: "VENDOR_PERMANENT_DELETE",
      vendorId: vendor.id,
      vendorRef: vendor.usernameLower,
      hadSelfClosed,
      applicationsKept: keepIds.length,
      applicationsPurged: purgeIds.length,
      blobsDeleted,
      result: "SUCCESS",
    },
  });

  return { vendorId: vendor.id, hadSelfClosed, applicationsKept: keepIds.length, applicationsPurged: purgeIds.length, blobsDeleted };
}
