-- AlterTable
ALTER TABLE "WhatsAppDelivery" ADD COLUMN     "applicationId" TEXT,
ADD COLUMN     "paymentId" TEXT,
ADD COLUMN     "triggerType" TEXT,
ADD COLUMN     "useCase" TEXT;

-- AlterTable
ALTER TABLE "WhatsAppTemplateCache" ADD COLUMN     "buttonsJson" TEXT,
ADD COLUMN     "footerText" TEXT,
ADD COLUMN     "headerText" TEXT;

-- CreateTable
CREATE TABLE "WhatsAppNotificationTemplate" (
    "id" TEXT NOT NULL,
    "useCase" TEXT NOT NULL,
    "templateName" TEXT NOT NULL,
    "templateLanguage" TEXT NOT NULL,
    "placeholderMappingJson" TEXT,
    "buttonMappingJson" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedByName" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WhatsAppNotificationTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppNotificationTemplate_useCase_key" ON "WhatsAppNotificationTemplate"("useCase");

-- CreateIndex
CREATE INDEX "WhatsAppDelivery_useCase_idx" ON "WhatsAppDelivery"("useCase");

-- CreateIndex
CREATE INDEX "WhatsAppDelivery_applicationId_idx" ON "WhatsAppDelivery"("applicationId");
