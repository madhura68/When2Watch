import type { Prisma, PrismaClient } from "@prisma/client";

/** Admin audit: action, time and internal ids only — never names, addresses or tokens. */
export function audit(db: PrismaClient | Prisma.TransactionClient, action: string, actorId: string | null, targetId: string | null) {
  return db.auditEvent.create({ data: { action, actorId, targetId } });
}
