-- AlterTable
ALTER TABLE "Vendor" ADD COLUMN     "logoUrl" TEXT,
ADD COLUMN     "tradeLicenseExpiry" TIMESTAMP(3),
ADD COLUMN     "tradeLicenseFileUrl" TEXT,
ADD COLUMN     "tradeLicenseNumber" TEXT,
ADD COLUMN     "website" TEXT;

-- CreateTable
CREATE TABLE "VendorNote" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VendorNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorWarning" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "eventId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'NOTICE',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "adminNote" TEXT,
    "viewedAt" TIMESTAMP(3),
    "acknowledgedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VendorWarning_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VendorNote_vendorId_idx" ON "VendorNote"("vendorId");

-- CreateIndex
CREATE INDEX "VendorWarning_vendorId_idx" ON "VendorWarning"("vendorId");

-- CreateIndex
CREATE INDEX "VendorWarning_eventId_idx" ON "VendorWarning"("eventId");

-- AddForeignKey
ALTER TABLE "VendorNote" ADD CONSTRAINT "VendorNote_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorWarning" ADD CONSTRAINT "VendorWarning_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorWarning" ADD CONSTRAINT "VendorWarning_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;
