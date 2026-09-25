import { afterEach, describe, expect, it } from "vitest";
import raw from "./fixtures/tvmaze/slow-horses.json";
import { GoogleCalendar } from "@/server/google-calendar";
import { SyncService } from "@/server/sync";
import { runScheduledSync } from "@/server/cron";
import { serializeCalendarMutation } from "@/server/calendar-mutations";
import { overview } from "@/server/overview";
import { parseSnapshot } from "@/server/tvmaze";
import { testDatabase } from "./database";
import { activeUser, installation } from "./fixtures/users";
import { simulatedCalendar } from "./simulated-calendar";

let storage: ReturnType<typeof testDatabase>;
afterEach(async () => { await storage?.close(); });
const now = new Date("2026-09-24T07:00:00Z"), config = { calendarId: "chosen@example.test", timeZone: "Europe/Amsterdam" };

async function twoFollowers() {
  storage = testDatabase(); const db = storage.db;
  await activeUser(db, "a", { role: "ADMIN", calendarId: config.calendarId }); await activeUser(db, "b", { calendarId: config.calendarId });
  await installation(db, "a");
  let sourceCalls = 0;
  const source = { snapshot: async (id: number) => { sourceCalls++; return parseSnapshot(raw, id); },
    updates: async () => new Map<number, number>(), artwork: async () => ({ bannerUrl: null, backgroundUrl: null }) };
  // Each user has an own Google account and therefore an own calendar.
  const calendars = { a: simulatedCalendar(), b: simulatedCalendar() } as Record<string, ReturnType<typeof simulatedCalendar>>;
  const services = (id: string) => new SyncService(db, new GoogleCalendar(async () => "synthetic-access", calendars[id].fetcher), source, config, () => now);
  const live = (id: string) => [...calendars[id].events.values()].filter(e => e.status !== "cancelled");
  return { db, calendars, services, live, sourceCalls: () => sourceCalls, source };
}

describe("two users sharing one series", () => {
  it("creates each user's own events from one shared source fetch; Proberen stays personal", async () => {
    const { db, services, live, sourceCalls } = await twoFollowers();
    expect((await services("a").add("a", 45039, true)).series[0]).toMatchObject({ created: 5, failed: 0 });
    // Unchanged source and a new follower: no new fetch, but B still gets B's own items.
    expect((await services("b").add("b", 45039)).series[0]).toMatchObject({ created: 5, failed: 0 });
    expect(sourceCalls()).toBe(1);
    expect(live("a").every(e => e.extendedProperties.private.userId === "a")).toBe(true);
    expect(live("b").every(e => e.extendedProperties.private.userId === "b")).toBe(true);
    expect(await db.catalogShow.count()).toBe(1);
    expect((await overview("a", db, now)).shows[0].trying).toBe(true);
    expect((await overview("b", db, now)).shows[0].trying).toBe(false);
    const links = await db.calendarEventLink.findMany({ select: { userId: true, bindingId: true, catalogEpisodeId: true } });
    expect(new Set(links.map(l => l.userId))).toEqual(new Set(["a", "b"]));
    expect(links.every(l => l.bindingId && l.catalogEpisodeId)).toBe(true);
  });

  it("removes only A's own items and relation when A stops; B and the shared catalog stay", async () => {
    const { db, services, live, calendars } = await twoFollowers();
    await services("a").add("a", 45039); await services("b").add("b", 45039);
    calendars.b.writes.length = 0;
    expect(await services("a").unfollow("a", 45039)).toEqual({ removed: 5 });
    expect(live("a")).toHaveLength(0); expect(live("b")).toHaveLength(5); expect(calendars.b.writes).toEqual([]);
    expect(await db.userFollow.findMany({ select: { userId: true } })).toEqual([{ userId: "b" }]);
    expect(await db.catalogShow.count()).toBe(1);
    expect((await services("b").sync("b", "manual")).series[0]).toMatchObject({ unchanged: 5, failed: 0 });
    await expect(services("b").unfollow("b", 999)).rejects.toMatchObject({ status: 404 });
  });

  it("removes the items of a show unfollowed while paused as soon as the binding is usable again", async () => {
    const { db, services, live } = await twoFollowers();
    await services("a").add("a", 45039);
    await db.account.update({ where: { id: "acc-a" }, data: { needsReauth: true } });
    expect(await services("a").unfollow("a", 45039)).toEqual({ removed: 0 });
    expect(live("a")).toHaveLength(5);
    await db.account.update({ where: { id: "acc-a" }, data: { needsReauth: false } });
    const result = await services("a").sync("a", "manual");
    expect(result.series).toEqual([expect.objectContaining({ showId: 45039, deleted: 5, failed: 0 })]);
    expect(live("a")).toHaveLength(0);
    expect(await runScheduledSync(db, { snapshot: async () => { throw Error("unused"); }, updates: async () => new Map(), artwork: async () => ({ bannerUrl: null, backgroundUrl: null }) }, services, now)).toMatchObject({ users: 0 });
  });

  it("never duplicates after a lost POST and restart, per user", async () => {
    const { db, services, live, calendars } = await twoFollowers();
    calendars.b.loseNextInsert();
    expect((await services("b").add("b", 45039)).status).not.toBe("success");
    expect((await services("b").sync("b", "manual")).status).toBe("success");
    expect(live("b")).toHaveLength(5);
    expect(calendars.b.writes.filter(w => w.method === "POST")).toHaveLength(5);
    expect(await db.calendarEventLink.count({ where: { userId: "b", status: "synced" } })).toBe(5);
  });

  it("blocks remote changes for a show waiting on reconciliation", async () => {
    const { db, services, calendars } = await twoFollowers();
    await services("a").add("a", 45039);
    await db.catalogShow.updateMany({ data: { needsReconcile: true } });
    calendars.a.writes.length = 0;
    const result = await services("a").sync("a", "manual");
    expect(result.status).toBe("failed"); expect(result.series[0].errors.join()).toMatch(/broncontrole/);
    expect(calendars.a.writes).toEqual([]);
  });
});

describe("scheduled sync per user", () => {
  it("refreshes the catalog once, then syncs each active user; a busy or failing user does not stop the others", async () => {
    const { db, services, live, source } = await twoFollowers();
    await services("a").add("a", 45039); await services("b").add("b", 45039);
    await activeUser(db, "c", { calendarId: config.calendarId });
    await db.userFollow.create({ data: { userId: "c", catalogShowId: (await db.catalogShow.findFirstOrThrow()).id } });
    await db.user.update({ where: { id: "c" }, data: { accessStatus: "BLOCKED" } });
    // A manual action of A holds A's lock while cron runs.
    let release!: () => void, entered!: () => void;
    const ready = new Promise<void>(r => entered = r), gate = new Promise<void>(r => release = r);
    const manual = serializeCalendarMutation("a", async () => { entered(); await gate; }); await ready;
    const report = await runScheduledSync(db, source, services, now);
    release(); await manual;
    expect(report).toMatchObject({ status: "partial", users: 2, succeeded: 1, busy: 1, failed: 0 });
    expect(JSON.stringify(report)).not.toMatch(/Slow Horses|@example|"a"|"b"/);
    expect(live("b")).toHaveLength(5);
    expect(await db.syncRun.count({ where: { userId: "c" } })).toBe(0);
    const again = await runScheduledSync(db, source, services, now);
    expect(again).toMatchObject({ status: "success", succeeded: 2 });
  });
});
