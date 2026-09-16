-- Removes the 2-minute booth-choosing/browsing timer entirely. Browsing the
-- floor plan/booth list no longer has any time limit or session state --
-- only an explicit hold (via the existing atomic booth-hold route) and the
-- unrelated acceptance/payment-hold timers still apply.
ALTER TABLE "Application" DROP COLUMN "boothSelectionExpiresAt";
