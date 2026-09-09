-- Vendor.username / Vendor.usernameLower
-- Added as nullable first, backfilled for existing rows, then tightened to
-- NOT NULL + a unique index on the lowercase canonical column — the DB
-- itself is the uniqueness authority (not just app-level checks), so a
-- race between two signups for the same username can never both succeed.

ALTER TABLE "Vendor" ADD COLUMN "username" TEXT;
ALTER TABLE "Vendor" ADD COLUMN "usernameLower" TEXT;

-- Backfill existing rows from the email local-part, sanitized to the
-- username charset and de-duplicated with a numeric suffix if needed.
WITH backfill AS (
  SELECT
    id,
    regexp_replace(lower(split_part(email, '@', 1)), '[^a-z0-9_]', '', 'g') AS base,
    row_number() OVER (
      PARTITION BY regexp_replace(lower(split_part(email, '@', 1)), '[^a-z0-9_]', '', 'g')
      ORDER BY "createdAt"
    ) AS rn
  FROM "Vendor"
)
UPDATE "Vendor" v
SET
  "usernameLower" = CASE WHEN backfill.rn = 1 THEN backfill.base ELSE backfill.base || backfill.rn::text END,
  "username" = CASE WHEN backfill.rn = 1 THEN backfill.base ELSE backfill.base || backfill.rn::text END
FROM backfill
WHERE v.id = backfill.id;

ALTER TABLE "Vendor" ALTER COLUMN "username" SET NOT NULL;
ALTER TABLE "Vendor" ALTER COLUMN "usernameLower" SET NOT NULL;

CREATE UNIQUE INDEX "Vendor_usernameLower_key" ON "Vendor"("usernameLower");
