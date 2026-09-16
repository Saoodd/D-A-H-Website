/*
  Warnings:

  - You are about to drop the column `phoneOtpPinId` on the `Vendor` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Vendor" DROP COLUMN "phoneOtpPinId",
ADD COLUMN     "phoneOtpAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "phoneOtpCodeHash" TEXT,
ADD COLUMN     "phoneOtpExpiresAt" TIMESTAMP(3);
