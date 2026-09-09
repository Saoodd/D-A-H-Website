-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "receiptNumber" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Payment_receiptNumber_key" ON "Payment"("receiptNumber");

-- A dedicated Postgres sequence for receipt numbering — nextval() is
-- atomic under concurrent successful payments, so two vendors paying at
-- the same instant can never collide on the same receipt number. Assigned
-- in application code (lib/receipts.ts) the moment a payment is marked
-- SUCCEEDED, formatted as DAH-RCP-{year}-{seq}.
CREATE SEQUENCE IF NOT EXISTS "ReceiptNumberSeq" START WITH 1;
