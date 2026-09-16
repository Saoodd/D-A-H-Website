-- AlterTable
ALTER TABLE "Vendor" ADD COLUMN     "whatsappOptInAt" TIMESTAMP(3),
ADD COLUMN     "whatsappOptInMethod" TEXT,
ADD COLUMN     "whatsappOptOutAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "Communication" (
    "id" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "internalName" TEXT NOT NULL,
    "sentByName" TEXT,
    "channel" TEXT NOT NULL,
    "eventId" TEXT,
    "eventNames" TEXT,
    "audienceFiltersJson" TEXT NOT NULL,
    "audienceSummary" TEXT NOT NULL,
    "emailSubject" TEXT,
    "emailBodyHtml" TEXT,
    "whatsappTemplateName" TEXT,
    "whatsappTemplateLanguage" TEXT,
    "whatsappVariablesJson" TEXT,
    "whatsappFreeformBody" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "isTest" BOOLEAN NOT NULL DEFAULT false,
    "totalRecipients" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "Communication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunicationRecipient" (
    "id" TEXT NOT NULL,
    "communicationId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "applicationId" TEXT,
    "businessNameSnapshot" TEXT NOT NULL,
    "contactNameSnapshot" TEXT NOT NULL,
    "emailSnapshot" TEXT,
    "phoneSnapshot" TEXT,
    "boothCodesSnapshot" TEXT,
    "applicationStatusSnapshot" TEXT,
    "channel" TEXT NOT NULL,
    "destination" TEXT,
    "emailDeliveryId" TEXT,
    "whatsappDeliveryId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "skipReason" TEXT,
    "queuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "CommunicationRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsAppDelivery" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "vendorId" TEXT,
    "eventId" TEXT,
    "toPhone" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'infobip',
    "templateName" TEXT,
    "providerMessageId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "failReason" TEXT,
    "dedupeKey" TEXT,
    "queuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),

    CONSTRAINT "WhatsAppDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsAppTemplateCache" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "category" TEXT,
    "status" TEXT,
    "bodyText" TEXT,
    "variableCount" INTEGER NOT NULL DEFAULT 0,
    "source" TEXT NOT NULL DEFAULT 'SYNCED',
    "isAuthTemplate" BOOLEAN NOT NULL DEFAULT false,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WhatsAppTemplateCache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Communication_idempotencyKey_key" ON "Communication"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Communication_eventId_idx" ON "Communication"("eventId");

-- CreateIndex
CREATE INDEX "Communication_status_idx" ON "Communication"("status");

-- CreateIndex
CREATE INDEX "Communication_createdAt_idx" ON "Communication"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CommunicationRecipient_emailDeliveryId_key" ON "CommunicationRecipient"("emailDeliveryId");

-- CreateIndex
CREATE UNIQUE INDEX "CommunicationRecipient_whatsappDeliveryId_key" ON "CommunicationRecipient"("whatsappDeliveryId");

-- CreateIndex
CREATE INDEX "CommunicationRecipient_communicationId_idx" ON "CommunicationRecipient"("communicationId");

-- CreateIndex
CREATE INDEX "CommunicationRecipient_vendorId_idx" ON "CommunicationRecipient"("vendorId");

-- CreateIndex
CREATE INDEX "CommunicationRecipient_status_idx" ON "CommunicationRecipient"("status");

-- CreateIndex
CREATE UNIQUE INDEX "CommunicationRecipient_communicationId_vendorId_channel_key" ON "CommunicationRecipient"("communicationId", "vendorId", "channel");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppDelivery_dedupeKey_key" ON "WhatsAppDelivery"("dedupeKey");

-- CreateIndex
CREATE INDEX "WhatsAppDelivery_vendorId_idx" ON "WhatsAppDelivery"("vendorId");

-- CreateIndex
CREATE INDEX "WhatsAppDelivery_type_idx" ON "WhatsAppDelivery"("type");

-- CreateIndex
CREATE INDEX "WhatsAppDelivery_providerMessageId_idx" ON "WhatsAppDelivery"("providerMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppTemplateCache_name_language_key" ON "WhatsAppTemplateCache"("name", "language");

-- AddForeignKey
ALTER TABLE "CommunicationRecipient" ADD CONSTRAINT "CommunicationRecipient_communicationId_fkey" FOREIGN KEY ("communicationId") REFERENCES "Communication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunicationRecipient" ADD CONSTRAINT "CommunicationRecipient_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppDelivery" ADD CONSTRAINT "WhatsAppDelivery_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
