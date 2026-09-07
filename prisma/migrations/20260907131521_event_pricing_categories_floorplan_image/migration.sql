/*
  Warnings:

  - You are about to drop the column `categoryNeeds` on the `Event` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Event" DROP COLUMN "categoryNeeds",
ADD COLUMN     "categories" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "floorPlanImageUrl" TEXT;

-- CreateTable
CREATE TABLE "EventPricing" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "sizeKey" TEXT NOT NULL,
    "priceAedFils" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventPricing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EventPricing_eventId_sizeKey_key" ON "EventPricing"("eventId", "sizeKey");

-- AddForeignKey
ALTER TABLE "EventPricing" ADD CONSTRAINT "EventPricing_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
