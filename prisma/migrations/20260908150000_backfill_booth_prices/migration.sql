-- One-time data backfill: every booth still relying on the tier/event-price
-- fallback (priceAedFils IS NULL) gets that resolved price written directly
-- onto the booth, matching lib/pricing.ts's getBoothPrice resolution order
-- (per-event tier override, then the global tier). After this, every booth
-- carries its own price — the event-level tier override UI is retired since
-- it no longer has anything left to control.
UPDATE "Booth" b
SET "priceAedFils" = COALESCE(
  (SELECT ep."priceAedFils" FROM "EventPricing" ep WHERE ep."eventId" = b."eventId" AND ep."sizeKey" = b."size"),
  (SELECT pt."priceAedFils" FROM "PricingTier" pt WHERE pt."sizeKey" = b."size" AND pt."active" = true)
)
WHERE b."priceAedFils" IS NULL;
