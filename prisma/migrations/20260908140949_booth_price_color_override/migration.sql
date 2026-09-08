-- AlterTable
ALTER TABLE "Booth" ADD COLUMN     "colorHex" TEXT,
ADD COLUMN     "priceAedFils" INTEGER,
ALTER COLUMN "size" SET DEFAULT 'custom';
