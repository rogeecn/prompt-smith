import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  pgPool?: Pool;
};

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("Missing DATABASE_URL");
}

const pool = globalForPrisma.pgPool ?? new Pool({ connectionString: databaseUrl });
const adapter = new PrismaPg(pool);
const cached = globalForPrisma.prisma;
const needsRefresh = cached ? !("artifact" in cached) : false;

export const prisma =
  cached && !needsRefresh ? cached : new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
  globalForPrisma.pgPool = pool;
}
