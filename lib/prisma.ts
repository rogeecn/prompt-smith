import { PrismaClient } from "@prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required for PrismaClient.");
}

const adapter = new PrismaLibSql({ url: databaseUrl });

const hasUserModel = Boolean(globalForPrisma.prisma?.user);

export const prisma =
  globalForPrisma.prisma && hasUserModel
    ? globalForPrisma.prisma
    : new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
