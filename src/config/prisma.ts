import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "@prisma/client";

import { env } from "./env";

declare global {
  // eslint-disable-next-line no-var
  var __goalgrainPrisma__: PrismaClient | undefined;
}

const adapter = new PrismaMariaDb(env.DATABASE_URL);

export const prisma =
  global.__goalgrainPrisma__ ??
  new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  global.__goalgrainPrisma__ = prisma;
}
