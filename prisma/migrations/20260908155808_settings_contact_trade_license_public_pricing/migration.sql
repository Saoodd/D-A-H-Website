-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "showPublicPricing" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Settings" ADD COLUMN     "contactEmail" TEXT,
ADD COLUMN     "contactInstagramHandle" TEXT,
ADD COLUMN     "tradeLicenseRequired" BOOLEAN NOT NULL DEFAULT false;
