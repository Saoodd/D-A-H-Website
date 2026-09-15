-- Data repair: applications that were legitimately paid but got their
-- status incorrectly flipped to ACCEPTANCE_EXPIRED by the expiry sweep
-- (lib/expiry.ts previously matched ANY ACCEPTED application past its
-- deadline, regardless of payment status). This restores them to ACCEPTED
-- (the correct status for a paid booking — getDisplayStatus() derives
-- "PAID" from ACCEPTED + a succeeded payment; there is no separate
-- CONFIRMED status) and clears the now-irrelevant deadline/expiredAt so
-- they can never be caught by that bug again even before the code fix
-- ships everywhere.
UPDATE "Application" AS a
SET
  "status" = 'ACCEPTED',
  "expiredAt" = NULL,
  "acceptanceExpiresAt" = NULL
WHERE
  a."status" = 'ACCEPTANCE_EXPIRED'
  AND EXISTS (
    SELECT 1 FROM "Payment" AS p
    WHERE p."applicationId" = a."id" AND p."status" = 'SUCCEEDED'
  );
