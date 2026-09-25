-- CreateTable
CREATE TABLE "VendorIdentity" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "email" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),

    CONSTRAINT "VendorIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VendorIdentity_provider_providerAccountId_key" ON "VendorIdentity"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "VendorIdentity_vendorId_provider_key" ON "VendorIdentity"("vendorId", "provider");

-- AddForeignKey
ALTER TABLE "VendorIdentity" ADD CONSTRAINT "VendorIdentity_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
