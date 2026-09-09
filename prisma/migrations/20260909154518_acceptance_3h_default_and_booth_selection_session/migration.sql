-- AlterTable
ALTER TABLE "Application" ADD COLUMN     "boothSelectionExpiresAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Settings" ALTER COLUMN "defaultAcceptanceDeadlineHours" SET DEFAULT 3;

-- DataMigration: bring the existing singleton row onto the new 3-hour
-- default. Only touches it if it's still at the old default (24) — an
-- admin who already customized this value keeps their choice.
UPDATE "Settings" SET "defaultAcceptanceDeadlineHours" = 3 WHERE "id" = 'singleton' AND "defaultAcceptanceDeadlineHours" = 24;
