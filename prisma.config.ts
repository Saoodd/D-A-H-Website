import "dotenv/config";
import { defineConfig } from "prisma/config";

// Prisma CLI configuration (Prisma 7+). The CLI no longer reads .env on its
// own, hence the dotenv import — on Vercel the variables are already in
// process.env and dotenv is a no-op.
//
// The CLI (migrate deploy/dev/diff, studio, seed) connects with DIRECT_URL:
// migrations take Postgres advisory locks, which don't work reliably over a
// PgBouncer-style pooler in transaction mode (the lock can be granted and
// released on different connections, so migrate times out with P1002).
// Locally DIRECT_URL and DATABASE_URL can be the same database; in
// production DIRECT_URL is the provider's non-pooled connection string (for
// Vercel Postgres/Neon, the value exposed as POSTGRES_URL_NON_POOLING).
// The running app connects separately, with DATABASE_URL — see lib/prisma.ts.
//
// process.env rather than Prisma's env() helper: env() throws when the
// variable is unset, which would break `prisma generate` (run on every
// install, needs no database) in any environment without DIRECT_URL.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env.DIRECT_URL,
  },
});
