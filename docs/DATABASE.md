# Database and migrations

Postgres, accessed through Prisma 7. The schema is `prisma/schema.prisma`
and the history is `prisma/migrations/`. This page covers how to change
the schema without putting production data at risk, and what to do if
something goes wrong.

## Connections

| Variable | Used by | Notes |
|---|---|---|
| `DATABASE_URL` | the app at runtime | Pooled connection in production. |
| `DIRECT_URL` | Prisma CLI (`migrate deploy`, `studio`, seed) | Non-pooled. Migrations need it for advisory locks. |

## When migrations run

Only in two places:
- `npm run build` on a **Vercel Production** deployment runs
  `prisma migrate deploy` (`scripts/build.mjs`);
- locally, when you run `npx prisma migrate dev`.

Preview builds don't migrate unless `MIGRATE_ON_PREVIEW=true`, which must
only be set when Preview has its own database. See
[DEPLOYMENT.md](DEPLOYMENT.md).

`migrate deploy` only applies pending migrations in order. It never
resets, never generates SQL and never drops the database.

## Writing a migration

1. Change `schema.prisma`, then:
   `npx prisma migrate dev --name <change> --create-only`
2. **Read the generated SQL.** Prisma sometimes turns a rename into drop
   and re-create, which loses data.
3. Apply locally (`npx prisma migrate dev`), then run the app and tests.
4. `npm run check` includes `check:migrations`, which fails on SQL that
   can lose or rewrite data (details below).

### Safe by default (no review marker needed)

- New tables, new indexes, new foreign keys.
- New columns that are nullable or have a default.

### Needs a two-step release

For a destructive change, do it in two releases and mark the second
migration as reviewed.

| Change | Release 1 | Release 2 |
|---|---|---|
| Remove a column/table | Stop reading and writing it; deploy. | Drop it. |
| Rename a column | Add the new column, backfill, write both, read the new one; deploy. | Drop the old one. |
| Make a column required | Add it nullable, backfill, make all writes set it; deploy. | `SET NOT NULL`. |
| Change a column type | Add a new column of the new type, backfill, switch reads/writes. | Drop the old one. |

Mark a reviewed destructive migration with a comment line in its
`migration.sql`:

```sql
-- destructive-reviewed: column unused since <release/commit>; backfilled in <migration>
```

The migrations that predate this check are listed in
`scripts/check-migrations.mjs`. They're already applied everywhere, so
**never edit an applied migration.** Write a new one instead.

### Data fixes

A one-off data repair (e.g. `20260915202511_repair_paid_applications_flagged_expired`)
goes in a migration only if:
- it's idempotent;
- it touches only the rows it has to;
- it has a comment explaining the bug it repairs.

It also needs the reviewed marker.

## Things that must never run against production

- `prisma migrate reset`, `prisma db push --force-reset`, `prisma migrate dev`.
- `npm run db:seed`. The seed publishes a demo event and creates demo
  vendors with a known password. It refuses to run:
  - on a production environment (`VERCEL_ENV=production` or
    `NODE_ENV=production`);
  - against any non-local database unless `SEED_ALLOW_REMOTE=true`, which
    is only for a throwaway dev database.
- Local test scripts (`tests/e2e/*`) refuse non-local databases.

## Records that are never deleted

These are enforced in code and, where possible, in the database:

| Record | Protection |
|---|---|
| Payments, refunds, payment audit log | An event with payments can't be deleted (409). Vendor removal anonymises the vendor and keeps paid applications. Refunds and payment events cascade only from their payment, which is never deleted. |
| Signed agreements (`AgreementAcceptance`) | `agreementId` has no `onDelete`, so the database refuses to delete a signed agreement. Deleting an event with signed terms returns a clear 409 instead of a server error. Vendor removal keeps the vendor row so acceptances survive. |
| Vendors | Never hard-deleted: permanent removal anonymises the row (`lib/vendorDeletion.ts`). |

## Backups and recovery

- **BLOCKED EXTERNAL STEP:** confirm point-in-time recovery (PITR) is
  enabled on the production Postgres (Neon, Vercel Postgres or Supabase)
  and note its retention window. Nothing in this repo can check it.
- Before a risky migration, take a manual snapshot. Either create a
  branch in your provider, or dump with the direct URL:
  `pg_dump "$DIRECT_URL" -Fc -f dah-$(date +%F).dump`, and store it
  somewhere access-controlled. It contains personal data.
- Restore to a *new* database first, check it, then repoint
  `DATABASE_URL`/`DIRECT_URL`. Never restore over the live database.

## If a production migration fails

`migrate deploy` stops at the failed migration. The deployment fails, and
the previous deployment keeps serving with the old schema.

1. Read the build log for the SQL error. Nothing after the failed
   statement ran. **Assume statements before it may have applied:**
   compare the database with the migration's SQL, using
   `npx prisma migrate diff`, before retrying. Keeping each migration
   small and additive keeps this easy.
2. Fix forward: correct the SQL in a *new* commit. If the failed
   migration never applied, you may fix that migration file itself, since
   it hasn't been recorded as applied.
3. Mark the failed attempt as rolled back so it can be retried:
   `npx prisma migrate resolve --rolled-back <migration_name>` (with
   `DIRECT_URL` pointing at production). Then redeploy.

Prisma has no automatic "down" migrations. To undo an applied change,
write a new migration that reverses it, following the same safety rules.

## Status at the Phase 15 audit (2026-09-25)

- 34 migrations; `prisma migrate status` is up to date, and
  `prisma migrate diff` (database vs schema) is empty, so there's no drift.
- The 4 migrations added in this modernisation are purely additive:
  - payment method and audit log;
  - session device info;
  - vendor identity;
  - payment lifecycle, refunds and webhooks.
- The 9 historical destructive migrations were reviewed and are listed in
  the check script.
