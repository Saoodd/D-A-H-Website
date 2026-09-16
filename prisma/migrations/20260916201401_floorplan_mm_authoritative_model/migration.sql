-- AlterTable
ALTER TABLE "Booth" ADD COLUMN     "boundaryOverride" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "xMm" INTEGER,
ADD COLUMN     "yMm" INTEGER;

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "venueBackgroundLocked" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "venueBackgroundNaturalHeightPx" INTEGER,
ADD COLUMN     "venueBackgroundNaturalWidthPx" INTEGER,
ADD COLUMN     "venueBackgroundOffsetXMm" DOUBLE PRECISION,
ADD COLUMN     "venueBackgroundOffsetYMm" DOUBLE PRECISION,
ADD COLUMN     "venueBackgroundRotationDeg" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "venueBackgroundScale" DOUBLE PRECISION,
ADD COLUMN     "venueBoundaryJson" TEXT,
ADD COLUMN     "venueDepthMm" INTEGER,
ADD COLUMN     "venueScaleConfirmed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "venueShape" TEXT NOT NULL DEFAULT 'RECTANGLE',
ADD COLUMN     "venueWidthMm" INTEGER;

-- AlterTable
ALTER TABLE "FloorPlanFeature" ADD COLUMN     "depthMm" INTEGER,
ADD COLUMN     "widthMm" INTEGER,
ADD COLUMN     "xMm" INTEGER,
ADD COLUMN     "yMm" INTEGER;
