import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/lib/generated/prisma/client";

// Prisma 7 connects through a driver adapter (node-postgres) instead of its
// own engine. The app uses DATABASE_URL — the pooled connection in
// production; migrations use DIRECT_URL via prisma.config.ts.
function createClient() {
  const adapter = new PrismaPg(process.env.DATABASE_URL ?? "");
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

const globalForPrisma = globalThis as unknown as { prisma?: ReturnType<typeof createClient> };

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
