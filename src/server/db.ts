import { PrismaClient } from "@prisma/client";

const globalDatabase = globalThis as typeof globalThis & { when2watchDb?: PrismaClient };

export function database(): PrismaClient {
  return globalDatabase.when2watchDb ??= new PrismaClient();
}
