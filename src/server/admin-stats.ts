import type { PrismaClient } from "@prisma/client";
import { adminFor } from "./user-access";
import { sourceRequestCounts } from "./tvmaze";

/**
 * Admin-only statistics: per shared show the number of distinct ACTIVE followers (Proberen counts once,
 * blocked or deleted users not). Show identity and a number only — never who follows.
 */
export async function getFollowerCounts(db: PrismaClient, adminId: string) {
  await adminFor(db, adminId);
  const rows = await db.$queryRaw<{ tvmazeId: number; title: string; followers: bigint }[]>`
    SELECT s."tvmazeId", s."title", COUNT(DISTINCT f."userId") AS followers
    FROM "UserFollow" f JOIN "CatalogShow" s ON s."id" = f."catalogShowId" JOIN "User" u ON u."id" = f."userId"
    WHERE u."accessStatus" = 'ACTIVE'
    GROUP BY s."id", s."tvmazeId", s."title"
    ORDER BY followers DESC, s."title" ASC`;
  return rows.map(row => ({ tvmazeId: row.tvmazeId, title: row.title, followers: Number(row.followers) }));
}

export async function adminStats(db: PrismaClient, adminId: string) {
  return { shows: await getFollowerCounts(db, adminId), tvmazeRequests: sourceRequestCounts() };
}
