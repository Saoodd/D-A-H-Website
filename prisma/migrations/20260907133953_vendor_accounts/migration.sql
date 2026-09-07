/*
  Warnings:

  - You are about to drop the column `message` on the `Application` table. All the data in the column will be lost.
  - Added the required column `category` to the `Vendor` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Application" DROP COLUMN "message";

-- AlterTable
-- category has a temporary default so this migration is safe to run against
-- a table with existing rows (e.g. production) — app code always supplies a
-- real category on every insert going forward, so the default is a one-time
-- backfill value only.
ALTER TABLE "Vendor" ADD COLUMN     "category" TEXT NOT NULL DEFAULT 'Other',
ADD COLUMN     "description" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "verified" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Vendor" ALTER COLUMN "category" DROP DEFAULT;
