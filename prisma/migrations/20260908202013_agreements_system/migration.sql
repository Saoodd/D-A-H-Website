-- CreateTable
CREATE TABLE "Agreement" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "eventId" TEXT,
    "version" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "bodyHtml" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Agreement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgreementAcceptance" (
    "id" TEXT NOT NULL,
    "agreementId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "applicationId" TEXT,
    "representativeName" TEXT,
    "snapshotType" TEXT NOT NULL,
    "snapshotTitle" TEXT NOT NULL,
    "snapshotVersion" INTEGER NOT NULL,
    "snapshotBodyHtml" TEXT NOT NULL,
    "snapshotBusinessName" TEXT NOT NULL,
    "snapshotContactName" TEXT NOT NULL,
    "snapshotEventName" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgreementAcceptance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Agreement_type_eventId_status_idx" ON "Agreement"("type", "eventId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Agreement_type_eventId_version_key" ON "Agreement"("type", "eventId", "version");

-- CreateIndex
CREATE INDEX "AgreementAcceptance_vendorId_idx" ON "AgreementAcceptance"("vendorId");

-- CreateIndex
CREATE INDEX "AgreementAcceptance_agreementId_idx" ON "AgreementAcceptance"("agreementId");

-- CreateIndex
CREATE INDEX "AgreementAcceptance_applicationId_idx" ON "AgreementAcceptance"("applicationId");

-- AddForeignKey
ALTER TABLE "Agreement" ADD CONSTRAINT "Agreement_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgreementAcceptance" ADD CONSTRAINT "AgreementAcceptance_agreementId_fkey" FOREIGN KEY ("agreementId") REFERENCES "Agreement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgreementAcceptance" ADD CONSTRAINT "AgreementAcceptance_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgreementAcceptance" ADD CONSTRAINT "AgreementAcceptance_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE SET NULL ON UPDATE CASCADE;
