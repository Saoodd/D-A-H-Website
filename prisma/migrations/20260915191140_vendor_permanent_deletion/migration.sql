-- AlterTable
ALTER TABLE "Vendor" ADD COLUMN     "permanentlyDeletedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "AdminAuditLog" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "vendorRef" TEXT NOT NULL,
    "hadSelfClosed" BOOLEAN NOT NULL,
    "applicationsKept" INTEGER NOT NULL,
    "applicationsPurged" INTEGER NOT NULL,
    "blobsDeleted" INTEGER NOT NULL,
    "result" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdminAuditLog_vendorId_idx" ON "AdminAuditLog"("vendorId");
