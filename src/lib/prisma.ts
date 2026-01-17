import type { PrismaClient } from "@prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required for PrismaClient.");
}

const adapter = new PrismaLibSql({ url: databaseUrl });

const hasProjectDescription = (client?: PrismaClient) => {
  const fields = (client as { _runtimeDataModel?: { models?: Record<string, { fields?: { name: string }[] }> } })
    ?._runtimeDataModel?.models?.Project?.fields;
  return Boolean(fields?.some((field) => field.name === "description"));
};

const isClientCompatible = (client?: PrismaClient) =>
  Boolean(client && typeof client.user?.findUnique === "function" && hasProjectDescription(client));

export const getPrisma = () => {
  if (isClientCompatible(globalForPrisma.prisma)) {
    return globalForPrisma.prisma!;
  }

  const moduleId = require.resolve("../../node_modules/.prisma/client");
  delete require.cache[moduleId];
  const { PrismaClient } = require("../../node_modules/.prisma/client") as {
    PrismaClient: new (options: { adapter: PrismaLibSql }) => PrismaClient;
  };
  const client = new PrismaClient({ adapter });
  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = client;
  }
  return client;
};
