import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PrismaClient } from "@prisma/client";
import { AppError } from "@/server/errors";
import { deleteOwnAccount, exportOwnData, freshLoginMs } from "@/server/privacy";
import { serializeCalendarMutation } from "@/server/calendar-mutations";
import { reactivateUser } from "@/server/admin-users";
import { runRetention } from "@/server/retention";
import { run as journalTool } from "../scripts/restore-privacy";
import { testDatabase } from "./database";
import { activeUser, installation } from "./fixtures/users";

const cleanups: (() => Promise<void> | void)[] = [];
afterEach(async () => { for (const clean of cleanups.splice(0)) await clean(); });
const now = new Date("2026-09-25T12:00:00Z"), clock = () => now;

function journalDir() {
  const dir = mkdtempSync(join(tmpdir(), "w2w-journal-")); cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  return join(dir, "deletions.jsonl");
}

/** Two users with personal data in the R2 tables and the read-only legacy tables, one shared show. */
async function seed(db: PrismaClient, journalId = "journal-1") {
  await activeUser(db, "a", { role: "ADMIN" }); await activeUser(db, "b", { role: "ADMIN" });
  await installation(db, "a");
  await db.installation.update({ where: { id: "singleton" }, data: { deletionJournalId: journalId, activeAccountId: "acc-a" } });
  const show = await db.catalogShow.create({ data: { tvmazeId: 45039, title: "Slow Horses", sourceUrl: "https://example.test/show", status: "Running" } });
  const episode = await db.catalogEpisode.create({ data: { catalogShowId: show.id, sourceId: 1, sourceUrl: "https://example.test/ep", airdate: "2026-10-01" } });
  for (const id of ["a", "b"]) {
    const binding = await db.calendarBinding.findFirstOrThrow({ where: { userId: id } });
    await db.userFollow.create({ data: { userId: id, catalogShowId: show.id, trying: id === "a" } });
    await db.userPreferences.create({ data: { userId: id, agendaMonths: 2 } });
    await db.calendarEventLink.create({ data: { userId: id, bindingId: binding.id, catalogEpisodeId: episode.id, calendarId: binding.calendarId, eventId: `evt${id}`, desiredJson: "{}", status: "synced" } });
    await db.syncRun.create({ data: { userId: id, trigger: "manual", status: "success" } });
    // Read-only legacy rows (R1 history).
    await db.calendarSettings.create({ data: { userId: id, calendarId: binding.calendarId, summary: "x", timeZone: "Europe/Amsterdam", accessRole: "owner", defaultRemindersJson: "[]" } });
    const legacy = await db.trackedShow.create({ data: { userId: id, tvmazeId: 45039, title: "Slow Horses", sourceUrl: "x", status: "Running" } });
    const legacyEpisode = await db.episode.create({ data: { trackedShowId: legacy.id, sourceId: 1, sourceUrl: "x" } });
    await db.calendarEventLink.create({ data: { episodeId: legacyEpisode.id, calendarId: `legacy-${id}`, eventId: `old${id}`, desiredJson: "{}" } });
    await db.session.create({ data: { userId: id, sessionToken: `session-${id}`, expires: new Date(now.getTime() + 86_400_000), createdAt: new Date(now.getTime() - 60_000) } });
    await db.calendarCreationAttempt.create({ data: { id: `create-${id}`, ownerId: id, accountId: `acc-${id}`, name: "When2Watch", timeZone: "Europe/Amsterdam", status: "selected" } });
  }
  await db.invitation.create({ data: { email: "friend@example.test", tokenHash: "hash-by-a", expiresAt: now, invitedById: "a" } });
  await db.invitation.create({ data: { email: "A@example.test", tokenHash: "hash-for-a", expiresAt: now, invitedById: "b", acceptedAt: now } });
  await db.auditEvent.create({ data: { action: "user.blocked", actorId: "a", targetId: "b" } });
  return { show };
}

async function withJournal(db: PrismaClient, journalId = "journal-1") {
  const path = journalDir();
  writeFileSync(path, `${JSON.stringify({ kind: "header", format: "w2w-deletion-journal-1", journalId, createdAt: now.toISOString() })}\n`, { mode: 0o600 });
  return path;
}

describe("own export", () => {
  it("contains the user's own data and no secrets, other users or invitation hashes", async () => {
    const storage = testDatabase(); cleanups.push(() => storage.close()); const db = storage.db;
    await seed(db);
    const data = await exportOwnData(db, "a", now), text = JSON.stringify(data);
    expect(data.user).toMatchObject({ id: "a", email: "a@example.test" });
    expect(data.follows).toEqual([expect.objectContaining({ tvmazeId: 45039, trying: true })]);
    expect(data.calendars).toHaveLength(1); expect(data.calendarItems).toEqual([expect.objectContaining({ eventId: "evta", tvmazeEpisodeId: 1 })]);
    expect(data.preferences).toEqual({ agendaMonths: 2, timeZone: "Europe/Amsterdam" });
    for (const forbidden of ["w2w:v1", "refresh", "synthetic-access", "hash-by-a", "hash-for-a", "b@example.test", "b-cal", "evtb", "session-a"]) expect(text).not.toContain(forbidden);
  });
});

describe("deleting the own account", () => {
  it("requires a typed confirmation, a fresh login and another admin; a missing journal deletes nothing", async () => {
    const storage = testDatabase(); cleanups.push(() => storage.close()); const db = storage.db;
    await seed(db); const journal = await withJournal(db);
    await expect(deleteOwnAccount(db, "a", "session-a", "ja", { journal, now: clock })).rejects.toMatchObject({ code: "CONFIRMATION_REQUIRED" });
    await expect(deleteOwnAccount(db, "a", "session-b", "VERWIJDEREN", { journal, now: clock })).rejects.toMatchObject({ code: "FRESH_LOGIN_REQUIRED" });
    await expect(deleteOwnAccount(db, "a", "session-a", "VERWIJDEREN", { journal, now: () => new Date(now.getTime() + freshLoginMs) })).rejects.toMatchObject({ code: "FRESH_LOGIN_REQUIRED" });
    await db.user.update({ where: { id: "b" }, data: { role: "USER" } });
    await expect(deleteOwnAccount(db, "a", "session-a", "VERWIJDEREN", { journal, now: clock })).rejects.toMatchObject({ code: "LAST_ADMIN" });
    await db.user.update({ where: { id: "b" }, data: { role: "ADMIN" } });
    await expect(deleteOwnAccount(db, "a", "session-a", "VERWIJDEREN", { journal: join(journal, "..", "missing.jsonl"), now: clock })).rejects.toMatchObject({ code: "JOURNAL_UNAVAILABLE" });
    await expect(deleteOwnAccount(db, "a", "session-a", "VERWIJDEREN", { journal: "relative.jsonl", now: clock })).rejects.toMatchObject({ code: "JOURNAL_UNAVAILABLE" });
    expect(await db.user.findUniqueOrThrow({ where: { id: "a" } })).toMatchObject({ accessStatus: "ACTIVE" });
    expect(await db.session.count({ where: { userId: "a" } })).toBe(1);
  });

  it("deletes nothing and restores access when the journal cannot be written", async () => {
    const storage = testDatabase(); cleanups.push(() => storage.close()); const db = storage.db;
    await seed(db); const journal = await withJournal(db);
    // A failing disk write (independent of file modes, which root ignores in CI).
    const failingWrite = () => { throw new AppError("JOURNAL_UNAVAILABLE", 503, "write failed"); };
    await expect(deleteOwnAccount(db, "a", "session-a", "VERWIJDEREN", { journal, now: clock, append: failingWrite })).rejects.toMatchObject({ code: "JOURNAL_UNAVAILABLE" });
    expect(await db.user.findUniqueOrThrow({ where: { id: "a" } })).toMatchObject({ accessStatus: "ACTIVE" });
    expect(await db.userFollow.count({ where: { userId: "a" } })).toBe(1); expect(await db.deletionTombstone.count()).toBe(0);
  });

  it("keeps a journalled deletion pending when the purge fails: no reactivation, and the daily retention completes it", async () => {
    const storage = testDatabase(); cleanups.push(() => storage.close()); const db = storage.db;
    await seed(db); const journal = await withJournal(db);
    let transactions = 0;
    const flaky = new Proxy(db, { get: (target, key) => key === "$transaction"
      ? (...args: unknown[]) => { if (++transactions === 2) throw Error("database gone"); return (target.$transaction as (...a: unknown[]) => unknown)(...args); }
      : Reflect.get(target, key) });
    await expect(deleteOwnAccount(flaky, "a", "session-a", "VERWIJDEREN", { journal, now: clock })).rejects.toThrow("database gone");
    expect(await db.user.findUniqueOrThrow({ where: { id: "a" } })).toMatchObject({ accessStatus: "BLOCKED" });
    expect(readFileSync(journal, "utf8")).toContain('"userId":"a"');
    await expect(reactivateUser(db, "b", "a")).rejects.toMatchObject({ status: 409 });
    expect(await runRetention(db, now)).toMatchObject({ pendingDeletions: 1 });
    expect(await db.user.findUnique({ where: { id: "a" } })).toBeNull();
    expect(await db.userFollow.count({ where: { userId: "b" } })).toBe(1);
  });

  it("blocks, drains in-flight work, journals, then removes all personal rows; B and the shared catalogue stay", async () => {
    const storage = testDatabase(); cleanups.push(() => storage.close()); const db = storage.db;
    const { show } = await seed(db); const journal = await withJournal(db);
    let release!: () => void, entered!: () => void;
    const inFlight = new Promise<void>(r => entered = r), gate = new Promise<void>(r => release = r);
    const manual = serializeCalendarMutation("a", async () => { entered(); await gate; }); await inFlight;
    let done = false;
    const deletion = deleteOwnAccount(db, "a", "session-a", "VERWIJDEREN", { journal, now: clock }).then(r => { done = true; return r; });
    await new Promise(r => setTimeout(r, 200));
    // Access ends at once, deletion waits for the running action.
    expect(done).toBe(false);
    expect(await db.user.findUniqueOrThrow({ where: { id: "a" } })).toMatchObject({ accessStatus: "BLOCKED" });
    expect(await db.session.count({ where: { userId: "a" } })).toBe(0);
    release(); await manual;
    expect(await deletion).toEqual({ deleted: true });

    expect(await db.user.findUnique({ where: { id: "a" } })).toBeNull();
    for (const count of [db.account.count({ where: { userId: "a" } }), db.userFollow.count({ where: { userId: "a" } }), db.calendarBinding.count({ where: { userId: "a" } }),
      db.calendarEventLink.count({ where: { OR: [{ userId: "a" }, { calendarId: "legacy-a" }] } }), db.trackedShow.count({ where: { userId: "a" } }), db.calendarSettings.count({ where: { userId: "a" } }),
      db.calendarCreationAttempt.count({ where: { ownerId: "a" } }), db.invitation.count(), db.syncRun.count({ where: { userId: "a" } })]) expect(await count).toBe(0);
    expect(await db.auditEvent.count({ where: { OR: [{ actorId: "a" }, { targetId: "a" }] } })).toBe(0);
    expect(await db.installation.findUniqueOrThrow({ where: { id: "singleton" } })).toMatchObject({ ownerId: null, activeAccountId: null });
    expect(await db.deletionTombstone.findUniqueOrThrow({ where: { userId: "a" } })).toMatchObject({ deletedAt: now });
    // B untouched; shared catalogue not cascaded.
    expect(await db.userFollow.count({ where: { userId: "b" } })).toBe(1); expect(await db.calendarEventLink.count({ where: { userId: "b" } })).toBe(1);
    expect(await db.trackedShow.count({ where: { userId: "b" } })).toBe(1); expect(await db.catalogShow.findUnique({ where: { id: show.id } })).not.toBeNull();
    const lines = readFileSync(journal, "utf8").trim().split("\n");
    expect(JSON.parse(lines[1])).toEqual({ kind: "deletion", userId: "a", deletedAt: now.toISOString() });
    expect(readFileSync(journal, "utf8")).not.toMatch(/example\.test|Slow Horses/);
  });
});

describe("restoring a backup", () => {
  it("re-applies journalled deletions before start: A does not return, B stays; missing, foreign or damaged journals block", async () => {
    const live = testDatabase(), backup = testDatabase(); cleanups.push(() => live.close(), () => backup.close());
    const journal = journalDir();
    // Cutover: both databases are the same installation; the backup is taken before A deletes the account.
    await seed(live.db, "unset"); await seed(backup.db, "unset");
    await live.db.installation.update({ where: { id: "singleton" }, data: { deletionJournalId: null } });
    expect(await journalTool(live.db, "init", journal)).toEqual({ status: "INITIALISED" });
    await expect(journalTool(live.db, "init", journal)).rejects.toThrow(/already has a journal/);
    const { deletionJournalId } = await live.db.installation.findUniqueOrThrow({ where: { id: "singleton" } });
    await backup.db.installation.update({ where: { id: "singleton" }, data: { deletionJournalId } });
    expect(await journalTool(live.db, "check", journal)).toEqual({ status: "VALID", entries: 0 });

    await deleteOwnAccount(live.db, "a", "session-a", "VERWIJDEREN", { journal, now: clock });
    await expect(journalTool(backup.db, "apply", join(journal, "..", "missing.jsonl"))).rejects.toMatchObject({ code: "JOURNAL_UNAVAILABLE" });
    expect(await journalTool(backup.db, "apply", journal)).toEqual({ status: "APPLIED", journalled: 1, purged: 1 });
    expect(await journalTool(backup.db, "apply", journal)).toEqual({ status: "APPLIED", journalled: 1, purged: 0 });
    expect(await backup.db.user.findUnique({ where: { id: "a" } })).toBeNull();
    expect(await backup.db.trackedShow.count({ where: { userId: "a" } })).toBe(0);
    expect(await backup.db.userFollow.count({ where: { userId: "b" } })).toBe(1);

    await backup.db.installation.update({ where: { id: "singleton" }, data: { deletionJournalId: "other-installation" } });
    await expect(journalTool(backup.db, "apply", journal)).rejects.toMatchObject({ code: "JOURNAL_UNAVAILABLE" });
    await backup.db.installation.update({ where: { id: "singleton" }, data: { deletionJournalId } });
    writeFileSync(journal, `${readFileSync(journal, "utf8")}{"kind":"deletion",`);
    await expect(journalTool(backup.db, "apply", journal)).rejects.toMatchObject({ code: "JOURNAL_UNAVAILABLE" });
  });
});
