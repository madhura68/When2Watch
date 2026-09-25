import type { PrismaClient } from "@prisma/client";
import { enforceCapacity } from "./search-cache";
import { purgeUser } from "./privacy";

const day = 86_400_000;
/** Retention periods of the specification (§ privacy). Backups (30 days) are rotated by the operator runbook. */
export const retention = { syncDiagnosticsDays: 30, auditDays: 90, terminalInvitationDays: 7, attemptDays: 7, failedCreationDays: 30, tombstoneDays: 31 } as const;

/**
 * Daily pruning. Recovery intentions are never removed on age alone: unconfirmed calendar creations
 * (sending/uncertain) and proven ones (created/ready/selected, the app-ownership proof) stay; running
 * sync runs stay. Returns counts only.
 */
export async function runRetention(db: PrismaClient, now = new Date()) {
  const before = (days: number) => new Date(now.getTime() - days * day), inviteCutoff = before(retention.terminalInvitationDays);
  // Complete own-account deletions whose purge failed after journalling (tombstone present, user still there).
  let pendingDeletions = 0;
  for (const { userId, deletedAt } of await db.deletionTombstone.findMany({ where: { userId: { in: (await db.user.findMany({ select: { id: true } })).map(u => u.id) } } })) {
    await db.$transaction(tx => purgeUser(tx, userId, deletedAt)); pendingDeletions++;
  }
  const counts = {
    pendingDeletions,
    searchCache: (await db.searchCache.deleteMany({ where: { expiresAt: { lte: now } } })).count,
    syncRuns: (await db.syncRun.deleteMany({ where: { startedAt: { lt: before(retention.syncDiagnosticsDays) }, status: { not: "running" } } })).count,
    audit: (await db.auditEvent.deleteMany({ where: { at: { lt: before(retention.auditDays) } } })).count,
    invitations: (await db.invitation.deleteMany({ where: { OR: [{ acceptedAt: { lt: inviteCutoff } }, { revokedAt: { lt: inviteCutoff } }, { expiresAt: { lt: inviteCutoff } }] } })).count,
    invitationFlows: (await db.invitationFlow.deleteMany({ where: { expiresAt: { lte: now } } })).count,
    // Pending tokens of an expired connection attempt are useless and dropped at once; the row itself after 7 days.
    attemptTokens: (await db.googleConnectionAttempt.updateMany({ where: { expiresAt: { lte: now }, tokensJson: { not: null } }, data: { tokensJson: null } })).count,
    attempts: (await db.googleConnectionAttempt.deleteMany({ where: { expiresAt: { lt: before(retention.attemptDays) } } })).count,
    failedCreations: (await db.calendarCreationAttempt.deleteMany({ where: { status: { in: ["abandoned", "rejected"] }, createdAt: { lt: before(retention.failedCreationDays) } } })).count,
    sessions: (await db.session.deleteMany({ where: { expires: { lt: now } } })).count,
    // The external journal is the restore source; the database index can go once no backup holds the user.
    tombstones: (await db.deletionTombstone.deleteMany({ where: { deletedAt: { lt: before(retention.tombstoneDays) } } })).count,
  };
  await enforceCapacity(db, now);
  return counts;
}
