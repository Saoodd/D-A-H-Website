/*
  Warnings:

  - You are about to drop the `EmailVerificationToken` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "EmailVerificationToken" DROP CONSTRAINT "EmailVerificationToken_vendorId_fkey";

-- AlterTable
ALTER TABLE "Vendor" ADD COLUMN     "phoneVerifiedMethod" TEXT;

-- DropTable
DROP TABLE "EmailVerificationToken";

-- CreateTable
CREATE TABLE "VendorPhoneVerificationLog" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VendorPhoneVerificationLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VendorPhoneVerificationLog_vendorId_idx" ON "VendorPhoneVerificationLog"("vendorId");

-- AddForeignKey
ALTER TABLE "VendorPhoneVerificationLog" ADD CONSTRAINT "VendorPhoneVerificationLog_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
