import { afterEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { backfillCatalog, loadLegacy, planBackfill } from "../../scripts/migration/backfill-catalog";
import { verifyCatalog } from "../../scripts/migration/verify-catalog";
import { testDatabase } from "../database";

let storage: ReturnType<typeof testDatabase>;
afterEach(async () => { await storage?.close(); });
const run = { runId: "backfill-1", sourceChecksum: "c02bc1f8" };
const at = (iso: string) => new Date(iso);

/** A and B share Slow Horses with different snapshots and reuse one event ID in different calendars. */
async function legacyAB(options: { conflictingDate?: boolean } = {}) {
  storage = testDatabase(); const db = storage.db;
  await db.user.createMany({ data: [{ id: "owner", email: "owner@example.test" }, { id: "b", email: "b@example.test" }] });
  await db.oAuthClientConfig.create({ data: { id: "client", clientId: "c", clientSecret: "s" } });
  await db.account.createMany({ data: [
    { id: "acc-owner", userId: "owner", type: "oauth", provider: "google", providerAccountId: "sub-owner", oauthClientConfigId: "client" },
    { id: "acc-b", userId: "b", type: "oauth", provider: "google", providerAccountId: "sub-b" },
  ] });
  await db.installation.create({ data: { ownerId: "owner", activeAccountId: "acc-owner", oauthClientConfigId: "client", initialCalendarId: "owner-cal" } });
  const settings = { summary: "When2Watch", timeZone: "Europe/Amsterdam", accessRole: "owner", defaultRemindersJson: "[]" };
  await db.calendarSettings.createMany({ data: [{ userId: "owner", calendarId: "owner-cal", ...settings }, { userId: "b", calendarId: "b-cal", ...settings }] });
  await db.calendarCreationAttempt.create({ data: { id: "creation", ownerId: "owner", accountId: "acc-owner", name: "When2Watch", timeZone: "Europe/Amsterdam", status: "selected", calendarId: "owner-cal" } });
  const show = { sourceUrl: "https://www.tvmaze.com/shows/45039", status: "Running" };
  await db.trackedShow.createMany({ data: [
    { id: "show-owner", userId: "owner", tvmazeId: 45039, title: "Slow Horses (new)", lastSuccessAt: at("2026-09-25T06:05:00Z"), ...show },
    { id: "show-b", userId: "b", tvmazeId: 45039, title: "Slow Horses (old)", trying: true, lastSuccessAt: at("2026-09-20T06:05:00Z"), ...show },
    { id: "show-b2", userId: "b", tvmazeId: 44776, title: "Lanterns", sourceUrl: "https://www.tvmaze.com/shows/44776", status: "In Development" },
  ] });
  const ep = (id: string, trackedShowId: string, sourceId: number, airdate: string | null) => ({ id, trackedShowId, sourceId, airdate, sourceUrl: `https://www.tvmaze.com/episodes/${sourceId}`, title: `E${sourceId}` });
  await db.episode.createMany({ data: [
    ep("ep-owner-1", "show-owner", 1, "2026-09-30"), ep("ep-owner-2", "show-owner", 2, "2026-10-07"),
    ep("ep-b-1", "show-b", 1, options.conflictingDate ? "2026-10-01" : "2026-09-30"), ep("ep-b-3", "show-b", 3, "2026-10-14"),
    ep("ep-b2-1", "show-b2", 9, null),
  ] });
  await db.calendarEventLink.createMany({ data: [
    { id: "link-owner", episodeId: "ep-owner-1", calendarId: "owner-cal", eventId: "same-event", status: "synced", desiredJson: "{\"a\":1}", confirmedDesiredHash: "dh-o", confirmedRemoteHash: "rh-o", lastDate: "2026-09-30" },
    { id: "link-b", episodeId: "ep-b-1", calendarId: "b-cal", eventId: "same-event", status: "prepared", desiredJson: "{\"b\":2}", lastDate: "2026-09-30" },
  ] });
  await db.session.create({ data: { userId: "owner", sessionToken: "old-owner-session", expires: at("2026-12-01T00:00:00Z") } });
  await db.probe.createMany({ data: [
    { id: "probe-owner", userId: "owner", calendarId: "owner-cal", eventId: "probe-event", date: "2026-09-24", status: "confirmed", requestJson: "{}" },
    { id: "probe-b", userId: "b", calendarId: "b-cal", eventId: "probe-event", date: "2026-09-24", status: "prepared", requestJson: "{}" },
  ] });
  return db;
}

describe("catalog backfill", () => {
  it("maps two users sharing a series into one catalog with exact personal relations and ownership", async () => {
    const db = await legacyAB();
    const legacyLinks = await db.calendarEventLink.findMany({ orderBy: { id: "asc" } });
    expect(await backfillCatalog(db, run)).toMatchObject({ status: "backfilled" });

    expect(await db.user.findMany({ orderBy: { id: "asc" }, select: { id: true, role: true, accessStatus: true } })).toEqual([
      { id: "b", role: "USER", accessStatus: "UNCLAIMED" }, { id: "owner", role: "ADMIN", accessStatus: "ACTIVE" },
    ]);
    const slow = await db.catalogShow.findUniqueOrThrow({ where: { tvmazeId: 45039 }, include: { episodes: { orderBy: { sourceId: "asc" } } } });
    expect(slow).toMatchObject({ title: "Slow Horses (new)", needsReconcile: false });
    expect(slow.episodes.map(e => e.sourceId)).toEqual([1, 2, 3]);
    expect(await db.catalogShow.count()).toBe(2);

    expect(await db.userFollow.findMany({ orderBy: { id: "asc" }, select: { id: true, userId: true, trying: true, show: { select: { tvmazeId: true } } } })).toEqual([
      { id: "show-b", userId: "b", trying: true, show: { tvmazeId: 45039 } },
      { id: "show-b2", userId: "b", trying: false, show: { tvmazeId: 44776 } },
      { id: "show-owner", userId: "owner", trying: false, show: { tvmazeId: 45039 } },
    ]);
    const owner = await db.calendarBinding.findUniqueOrThrow({ where: { userId_calendarId: { userId: "owner", calendarId: "owner-cal" } } });
    const b = await db.calendarBinding.findUniqueOrThrow({ where: { userId_calendarId: { userId: "b", calendarId: "b-cal" } } });
    expect(owner).toMatchObject({ status: "ACTIVE", provenance: "APP_CREATED", accountId: "acc-owner", summary: "When2Watch", timeZone: "Europe/Amsterdam" });
    expect(b).toMatchObject({ status: "LEGACY_UNRESOLVED", provenance: "LEGACY_UNVERIFIED", accountId: null });
    expect(await db.userConnection.findMany()).toMatchObject([{ userId: "owner", accountId: "acc-owner" }]);

    const episode1 = slow.episodes[0].id, links = await db.calendarEventLink.findMany({ orderBy: { id: "asc" } });
    expect(links.map(l => ({ id: l.id, userId: l.userId, bindingId: l.bindingId, catalogEpisodeId: l.catalogEpisodeId }))).toEqual([
      { id: "link-b", userId: "b", bindingId: b.id, catalogEpisodeId: episode1 },
      { id: "link-owner", userId: "owner", bindingId: owner.id, catalogEpisodeId: episode1 },
    ]);
    // Legacy values untouched: event IDs, calendars, status, payload, hashes and dates.
    const legacyFields = (l: typeof legacyLinks[number]) => ({ ...l, userId: null, bindingId: null, catalogEpisodeId: null });
    expect(links.map(legacyFields)).toEqual(legacyLinks);
    expect(await db.probe.findMany({ orderBy: { id: "asc" }, select: { id: true, eventId: true, bindingId: true } })).toEqual([
      { id: "probe-b", eventId: "probe-event", bindingId: b.id }, { id: "probe-owner", eventId: "probe-event", bindingId: owner.id },
    ]);
    expect(await verifyCatalog(db, run.runId)).toMatchObject({ passed: true });
    expect(await db.trackedShow.count()).toBe(3);
    // R2 activation signs everyone out; old single-owner sessions are not reused.
    expect(await db.session.count()).toBe(0);
  });

  it("marks conflicting snapshots for reconciliation instead of mixing or dropping data", async () => {
    const db = await legacyAB({ conflictingDate: true });
    await backfillCatalog(db, run);
    const slow = await db.catalogShow.findUniqueOrThrow({ where: { tvmazeId: 45039 }, include: { episodes: true } });
    expect(slow.needsReconcile).toBe(true);
    expect(slow.episodes.find(e => e.sourceId === 1)?.airdate).toBe("2026-09-30");
    expect(await verifyCatalog(db, run.runId)).toMatchObject({ passed: true });
  });

  it("refuses an unknown or ambiguous active owner and leaves the database unchanged", async () => {
    const db = await legacyAB();
    await db.installation.update({ where: { id: "singleton" }, data: { activeAccountId: "acc-b" } });
    await expect(backfillCatalog(db, run)).rejects.toThrow(/active account/i);
    expect(await db.catalogShow.count()).toBe(0);
    expect(await db.migrationRun.count()).toBe(0);
    await db.installation.delete({ where: { id: "singleton" } });
    await expect(backfillCatalog(db, run)).rejects.toThrow(/owner/i);
    expect(await db.user.count({ where: { role: "ADMIN" } })).toBe(0);
  });

  it("refuses a mapping collision inside one binding instead of choosing a record", async () => {
    const db = await legacyAB();
    const source = await loadLegacy(db);
    // Two legacy links of one user and calendar that map to the same shared episode.
    source.links.push({ ...source.links.find(l => l.id === "link-owner")!, id: "link-dup", episodeId: "ep-owner-1", eventId: "other-event" });
    expect(() => planBackfill(source, () => "id")).toThrow(/collision/i);
  });

  it("only verifies a completed identical run and refuses a second different run", async () => {
    const db = await legacyAB();
    await backfillCatalog(db, run);
    expect(await backfillCatalog(db, run)).toMatchObject({ status: "already-completed" });
    await expect(backfillCatalog(db, { ...run, runId: "backfill-2" })).rejects.toThrow(/already/i);
    expect(await db.catalogShow.count()).toBe(2);
  });

  it("detects a broken mapping after the fact", async () => {
    const db = await legacyAB();
    await backfillCatalog(db, run);
    await db.userFollow.update({ where: { id: "show-b" }, data: { trying: false } });
    expect(await verifyCatalog(db, run.runId)).toMatchObject({ passed: false, problems: { followMismatch: 1 } });
  });
});

describe("R2 database invariants after the whole migrate deploy chain", () => {
  async function binding(db: PrismaClient, data: Record<string, unknown>) {
    return db.calendarBinding.create({ data: { calendarId: `cal-${Math.random()}`, provenance: "LEGACY_UNVERIFIED", ...data } as never });
  }
  it("keeps the SQL-only index and checks in pg_catalog", async () => {
    storage = testDatabase(); const db = storage.db;
    const indexes = await db.$queryRaw<{ indexdef: string }[]>`SELECT indexdef FROM pg_indexes WHERE indexname = 'CalendarBinding_one_active_per_user'`;
    expect(indexes[0]?.indexdef).toMatch(/UNIQUE.*WHERE.*status.*ACTIVE/);
    const checks = await db.$queryRaw<{ conname: string }[]>`SELECT conname FROM pg_constraint WHERE contype = 'c' ORDER BY conname`;
    expect(checks.map(c => c.conname)).toEqual(expect.arrayContaining(["CalendarBinding_account_required", "CalendarEventLink_ownership_complete"]));
  });

  it("rejects invalid writes: second active binding, unproven account, foreign account, partial link ownership, catalog cascade", async () => {
    storage = testDatabase(); const db = storage.db;
    await db.user.createMany({ data: [{ id: "a" }, { id: "b" }] });
    await db.account.createMany({ data: [{ id: "acc-a", userId: "a", type: "oauth", provider: "google", providerAccountId: "sa" }, { id: "acc-b", userId: "b", type: "oauth", provider: "google", providerAccountId: "sb" }] });
    await binding(db, { userId: "a", accountId: "acc-a", status: "ACTIVE" });
    await expect(binding(db, { userId: "a", accountId: "acc-a", status: "ACTIVE" })).rejects.toThrow();
    await expect(binding(db, { userId: "a", status: "INACTIVE" })).rejects.toThrow();
    await expect(binding(db, { userId: "a", accountId: "acc-b", status: "INACTIVE" })).rejects.toThrow();
    const bindingB = await binding(db, { userId: "b", accountId: "acc-b", status: "ACTIVE" });
    await expect(db.userConnection.create({ data: { userId: "a", accountId: "acc-b" } })).rejects.toThrow();

    await db.trackedShow.create({ data: { id: "ts", userId: "a", tvmazeId: 1, title: "x", sourceUrl: "x", status: "x" } });
    await db.episode.create({ data: { id: "e", trackedShowId: "ts", sourceId: 1, sourceUrl: "x" } });
    const show = await db.catalogShow.create({ data: { tvmazeId: 1, title: "x", sourceUrl: "x", status: "x" } });
    const episode = await db.catalogEpisode.create({ data: { catalogShowId: show.id, sourceId: 1, sourceUrl: "x" } });
    // A's link may not point at B's binding, nor omit the user while naming a binding.
    await expect(db.calendarEventLink.create({ data: { episodeId: "e", calendarId: "c", eventId: "x1", desiredJson: "{}", userId: "a", bindingId: bindingB.id, catalogEpisodeId: episode.id } })).rejects.toThrow();
    await expect(db.$executeRaw`INSERT INTO "CalendarEventLink"(id,"episodeId","calendarId","eventId","desiredJson","bindingId","catalogEpisodeId") VALUES ('l','e','c','x2','{}',${bindingB.id},${episode.id})`).rejects.toThrow();
    // Same event ID is allowed in a different calendar, not twice in one.
    await db.calendarEventLink.create({ data: { id: "l1", episodeId: "e", calendarId: "c1", eventId: "same", desiredJson: "{}" } });
    await db.calendarEventLink.create({ data: { id: "l2", episodeId: "e", calendarId: "c2", eventId: "same", desiredJson: "{}" } });
    await expect(db.calendarEventLink.create({ data: { episodeId: "e", calendarId: "c1", eventId: "same", desiredJson: "{}" } })).rejects.toThrow();

    await db.userFollow.create({ data: { userId: "a", catalogShowId: show.id } });
    await db.user.delete({ where: { id: "b" } }).catch(() => undefined);
    await expect(db.catalogShow.delete({ where: { id: show.id } })).rejects.toThrow();
    await db.userFollow.deleteMany({ where: { userId: "a" } });
    expect(await db.catalogShow.count()).toBe(1);
  });
});
