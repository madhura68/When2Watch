import { closeSync, fsyncSync, openSync, readFileSync, writeSync } from "node:fs";
import type { Prisma, PrismaClient } from "@prisma/client";
import { AppError } from "./errors";
import { accessFor } from "./user-access";
import { serializeCalendarMutation } from "./calendar-mutations";

type Tx = Prisma.TransactionClient;
const journalFormat = "w2w-deletion-journal-1";
export const deletionConfirmation = "VERWIJDEREN";
export const freshLoginMs = 10 * 60_000;

// ------------------------------------------------------------------ export

/** Own data only, by whitelist: no tokens, no other users, no invitation hashes, no public catalogue dump. */
export async function exportOwnData(db: PrismaClient, userId: string, now = new Date()) {
  await accessFor(db, userId);
  const [user, preferences, follows, connection, bindings, links, syncRuns] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { id: userId }, select: { id: true, name: true, email: true, role: true, accessStatus: true } }),
    db.userPreferences.findUnique({ where: { userId }, select: { agendaMonths: true, timeZone: true } }),
    db.userFollow.findMany({ where: { userId }, orderBy: { createdAt: "asc" }, select: { trying: true, createdAt: true, lastAttemptAt: true, lastSuccessAt: true, lastError: true,
      show: { select: { tvmazeId: true, title: true, sourceUrl: true } } } }),
    db.userConnection.findUnique({ where: { userId }, select: { account: { select: { provider: true, profileEmail: true, scope: true } } } }),
    db.calendarBinding.findMany({ where: { userId }, orderBy: { createdAt: "asc" }, select: { calendarId: true, summary: true, timeZone: true, status: true, provenance: true, createdAt: true } }),
    db.calendarEventLink.findMany({ where: { userId }, orderBy: { id: "asc" }, select: { calendarId: true, eventId: true, status: true, lastDate: true,
      catalogEpisode: { select: { sourceId: true, sourceUrl: true, show: { select: { tvmazeId: true } } } } } }),
    db.syncRun.findMany({ where: { userId }, orderBy: { startedAt: "desc" }, select: { trigger: true, startedAt: true, finishedAt: true, status: true } }),
  ]);
  return {
    format: "when2watch-export-1", exportedAt: now.toISOString(), user, preferences,
    follows: follows.map(({ show, ...follow }) => ({ ...follow, tvmazeId: show.tvmazeId, title: show.title, source: show.sourceUrl })),
    googleConnection: connection ? { provider: connection.account.provider, email: connection.account.profileEmail, scopes: connection.account.scope?.split(/\s+/) ?? [] } : null,
    calendars: bindings,
    calendarItems: links.map(({ catalogEpisode, ...link }) => ({ ...link, tvmazeShowId: catalogEpisode?.show.tvmazeId ?? null,
      tvmazeEpisodeId: catalogEpisode?.sourceId ?? null, source: catalogEpisode?.sourceUrl ?? null })),
    syncRuns,
  };
}

// ------------------------------------------------------------------ deletion journal

/**
 * The external, append-only restore source for deletions (JSON lines, file mode 0600), kept outside the
 * database and its backups. Only internal user ids and times; no names or addresses. A missing or damaged
 * journal is an error; it is never silently recreated.
 */
export function journalPath(value = process.env.W2W_DELETION_JOURNAL) {
  if (!value?.startsWith("/")) throw new AppError("JOURNAL_UNAVAILABLE", 503, "Het verwijderjournaal is niet ingericht. Verwijderen kan nu niet; neem contact op met de beheerder.");
  return value;
}

export function initJournal(path: string, journalId: string, now = new Date()) {
  let fd: number;
  try { fd = openSync(path, "wx", 0o600); } catch { throw Error("The deletion journal already exists or its directory is not writable; refusing to create a new one."); }
  try { writeSync(fd, `${JSON.stringify({ kind: "header", format: journalFormat, journalId, createdAt: now.toISOString() })}\n`); fsyncSync(fd); }
  finally { closeSync(fd); }
}

export function readJournal(path: string, journalId: string | null | undefined) {
  const broken = (why: string) => new AppError("JOURNAL_UNAVAILABLE", 503, `Het verwijderjournaal is ${why}. Verwijderen en herstellen zijn geblokkeerd tot de beheerder dit oplost.`);
  let text: string;
  try { text = readFileSync(path, "utf8"); } catch { throw broken("niet leesbaar"); }
  if (!text.endsWith("\n")) throw broken("onvolledig");
  const lines = text.slice(0, -1).split("\n").map(line => { try { return JSON.parse(line) as Record<string, unknown>; } catch { throw broken("beschadigd"); } });
  const [header, ...entries] = lines;
  if (header?.kind !== "header" || header.format !== journalFormat || !journalId || header.journalId !== journalId) throw broken("niet van deze installatie");
  const deleted = new Map<string, string>();
  for (const entry of entries) {
    if (entry.kind !== "deletion" || typeof entry.userId !== "string" || typeof entry.deletedAt !== "string") throw broken("beschadigd");
    if (!deleted.has(entry.userId)) deleted.set(entry.userId, entry.deletedAt);
  }
  return deleted;
}

function appendDeletion(path: string, journalId: string | null, userId: string, at: Date) {
  readJournal(path, journalId);
  let fd: number | undefined;
  try {
    fd = openSync(path, "a");
    writeSync(fd, `${JSON.stringify({ kind: "deletion", userId, deletedAt: at.toISOString() })}\n`); fsyncSync(fd);
  } catch { throw new AppError("JOURNAL_UNAVAILABLE", 503, "Het verwijderjournaal kon niet worden bijgewerkt. Er is niets verwijderd."); }
  finally { if (fd !== undefined) closeSync(fd); }
}

// ------------------------------------------------------------------ deletion

/** Removes every personal row of one user, including legacy tables. The shared catalogue stays. Idempotent. */
export async function purgeUser(tx: Tx, userId: string, deletedAt: Date) {
  const user = await tx.user.findUnique({ where: { id: userId }, select: { email: true, accounts: { select: { id: true } } } });
  if (user) {
    const accountIds = user.accounts.map(a => a.id);
    await tx.installation.updateMany({ where: { ownerId: userId }, data: { ownerId: null } });
    await tx.installation.updateMany({ where: { activeAccountId: { in: accountIds } }, data: { activeAccountId: null } });
    await tx.calendarEventLink.deleteMany({ where: { OR: [{ userId }, { episode: { show: { userId } } }] } });
    await tx.probe.deleteMany({ where: { userId } });
    await tx.userConnection.deleteMany({ where: { userId } });
    await tx.calendarBinding.deleteMany({ where: { userId } });
    await tx.invitation.deleteMany({ where: { OR: [{ invitedById: userId }, ...(user.email ? [{ email: { equals: user.email, mode: "insensitive" as const } }] : [])] } });
    if (user.email) await tx.verificationToken.deleteMany({ where: { identifier: user.email } });
    // Cascades: accounts, sessions, preferences, follows, sync runs, creation/connection attempts, legacy calendar and shows.
    await tx.user.delete({ where: { id: userId } });
  }
  // Audit keeps the fact, not the person.
  await tx.auditEvent.updateMany({ where: { actorId: userId }, data: { actorId: null } });
  await tx.auditEvent.updateMany({ where: { targetId: userId }, data: { targetId: null } });
  await tx.deletionTombstone.upsert({ where: { userId }, create: { userId, deletedAt }, update: {} });
}

/**
 * Deletes the signed-in user's own account after a fresh login and typed confirmation. Order: block and
 * revoke sessions, drain in-flight Calendar work, journal durably, then delete. A journal failure deletes
 * nothing and restores the previous access. Items in Google Calendar stay where they are.
 */
export async function deleteOwnAccount(db: PrismaClient, userId: string, sessionToken: string, confirmation: unknown, options: { journal?: string; now?: () => Date } = {}) {
  const now = options.now ?? (() => new Date());
  const user = await accessFor(db, userId);
  if (confirmation !== deletionConfirmation) throw new AppError("CONFIRMATION_REQUIRED", 400, `Typ ${deletionConfirmation} om je account te verwijderen.`);
  const session = await db.session.findUnique({ where: { sessionToken }, select: { userId: true, createdAt: true } });
  if (!session || session.userId !== userId || now().getTime() - session.createdAt.getTime() > freshLoginMs) {
    throw new AppError("FRESH_LOGIN_REQUIRED", 401, "Log opnieuw in en verwijder je account binnen 10 minuten daarna.");
  }
  if (user.role === "ADMIN" && await db.user.count({ where: { role: "ADMIN", accessStatus: "ACTIVE", id: { not: userId } } }) === 0) {
    throw new AppError("LAST_ADMIN", 409, "Je bent de laatste beheerder. Maak eerst iemand anders beheerder.");
  }
  const path = journalPath(options.journal), journalId = (await db.installation.findUnique({ where: { id: "singleton" }, select: { deletionJournalId: true } }))?.deletionJournalId ?? null;
  readJournal(path, journalId);

  await db.$transaction(async tx => {
    await tx.user.update({ where: { id: userId }, data: { accessStatus: "BLOCKED" } });
    await tx.session.deleteMany({ where: { userId } });
  });
  return serializeCalendarMutation(userId, async () => {
    const at = now();
    try { appendDeletion(path, journalId, userId, at); }
    catch (error) { await db.user.update({ where: { id: userId }, data: { accessStatus: "ACTIVE" } }); throw error; }
    await db.$transaction(async tx => {
      await purgeUser(tx, userId, at);
      await tx.auditEvent.create({ data: { action: "user.deleted-self", at } });
    });
    return { deleted: true };
  });
}

/**
 * Restore step before app and cron start: applies every journalled deletion to the restored database.
 * Requires the installation's own journal; a missing or damaged journal blocks the restore.
 */
export async function applyDeletionJournal(db: PrismaClient, path: string) {
  const installation = await db.installation.findUnique({ where: { id: "singleton" }, select: { deletionJournalId: true } });
  const deleted = readJournal(path, installation?.deletionJournalId);
  let purged = 0;
  for (const [userId, at] of deleted) {
    const present = await db.user.count({ where: { id: userId } });
    await db.$transaction(tx => purgeUser(tx, userId, new Date(at)));
    purged += present;
  }
  return { journalled: deleted.size, purged };
}
