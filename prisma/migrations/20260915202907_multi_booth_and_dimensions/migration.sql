-- AlterTable
ALTER TABLE "Application" ADD COLUMN     "setupDepthMm" INTEGER,
ADD COLUMN     "setupWidthMm" INTEGER;

-- AlterTable
ALTER TABLE "Booth" ADD COLUMN     "depthMm" INTEGER,
ADD COLUMN     "widthMm" INTEGER;

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "allowMultipleBooths" BOOLEAN;

-- AlterTable
ALTER TABLE "Settings" ADD COLUMN     "allowMultipleBoothsDefault" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "PaymentBooth" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "boothId" TEXT NOT NULL,
    "priceAedFilsAtCharge" INTEGER NOT NULL,

    CONSTRAINT "PaymentBooth_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PaymentBooth_boothId_idx" ON "PaymentBooth"("boothId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentBooth_paymentId_boothId_key" ON "PaymentBooth"("paymentId", "boothId");

-- AddForeignKey
ALTER TABLE "PaymentBooth" ADD CONSTRAINT "PaymentBooth_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentBooth" ADD CONSTRAINT "PaymentBooth_boothId_fkey" FOREIGN KEY ("boothId") REFERENCES "Booth"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Data backfill: every existing Payment row (historical, all single-booth)
-- gets a mirroring PaymentBooth row, so nothing needs to special-case
-- "old payments with no booths[] rows" — every Payment, past or future,
-- always has at least one PaymentBooth row once this migration has run.
INSERT INTO "PaymentBooth" ("id", "paymentId", "boothId", "priceAedFilsAtCharge")
SELECT gen_random_uuid()::text, "id", "boothId", "amountAedFils"
FROM "Payment";
