import { afterEach, describe, expect, it } from "vitest";
import show from "./fixtures/tvmaze/slow-horses.json";
import search from "./fixtures/tvmaze/slow-horses-search.json";
import images from "./fixtures/tvmaze/slow-horses-images-source.json";
import { GoogleCalendar } from "@/server/google-calendar";
import { SyncService } from "@/server/sync";
import { runScheduledSync } from "@/server/cron";
import { cachedSearch } from "@/server/search-cache";
import { overview } from "@/server/overview";
import { getFollowerCounts } from "@/server/admin-stats";
import { TVmaze, sourceRequestCounts } from "@/server/tvmaze";
import { testDatabase } from "./database";
import { activeUser, installation } from "./fixtures/users";
import { simulatedCalendar } from "./simulated-calendar";

let storage: ReturnType<typeof testDatabase>;
afterEach(async () => { await storage?.close(); });

/** The real TVmaze client (spacing, retries, counting) over a synthetic transport; Google is a separate simulated fetcher. */
function tvmaze() {
  const fetcher = (async (url: string) => {
    const path = new URL(url).pathname;
    if (path === "/search/shows") return Response.json(search);
    if (path === "/shows/45039") return Response.json(show);
    if (path === "/shows/45039/images") return Response.json(images);
    if (path === "/updates/shows") return Response.json({ 45039: show.updated });
    return new Response("not found", { status: 404 });
  }) as typeof fetch;
  return new TVmaze(fetcher, async () => {});
}
const delta = (before: ReturnType<typeof sourceRequestCounts>) => {
  const after = sourceRequestCounts();
  return { total: after.total - before.total, search: after.search - before.search, show: after.show - before.show, updates: after.updates - before.updates };
};

describe("A2 — TVmaze traffic with two users (measured on the real client)", () => {
  it("fetches a search once, a snapshot once, nothing for page views or a refollow within the hour, only the index for an unchanged daily run", async () => {
    storage = testDatabase(); const db = storage.db;
    // The simulated Google calendar answers as chosen@example.test; each user has an own simulated instance.
    await activeUser(db, "a", { role: "ADMIN", calendarId: "chosen@example.test" }); await activeUser(db, "b", { calendarId: "chosen@example.test" }); await installation(db, "a");
    const source = tvmaze(), calendars = { a: simulatedCalendar(), b: simulatedCalendar() } as Record<string, ReturnType<typeof simulatedCalendar>>;
    let now = new Date("2026-09-25T08:00:00Z");
    const sync = (id: string) => new SyncService(db, new GoogleCalendar(async () => "synthetic-access", calendars[id].fetcher), source, { calendarId: "chosen@example.test", timeZone: "Europe/Amsterdam" }, () => now);
    const steps: Record<string, ReturnType<typeof delta>> = {};
    const measure = async (name: string, work: () => Promise<unknown>) => { const before = sourceRequestCounts(); await work(); steps[name] = delta(before); };

    await measure("searchA", () => cachedSearch(db, source, "Slow Horses", now));
    await measure("searchB", () => cachedSearch(db, source, "  slow   horses ", now));
    await measure("followA", () => sync("a").add("a", 45039, true));
    await measure("followB", () => sync("b").add("b", 45039));
    await measure("pages", async () => { await overview("a", db, now); await overview("b", db, now); });
    await measure("refollowSameHour", async () => { await sync("b").unfollow("b", 45039); await sync("b").add("b", 45039); });
    now = new Date("2026-09-26T04:05:00Z");
    await measure("daily", () => runScheduledSync(db, source, sync, now));
    await measure("refollowNextDay", async () => { await sync("b").unfollow("b", 45039); await sync("b").add("b", 45039); });

    expect(steps).toEqual({
      searchA: { total: 1, search: 1, show: 0, updates: 0 }, searchB: { total: 0, search: 0, show: 0, updates: 0 },
      followA: { total: 2, search: 0, show: 2, updates: 0 }, // snapshot + artwork
      followB: { total: 0, search: 0, show: 0, updates: 0 }, pages: { total: 0, search: 0, show: 0, updates: 0 },
      refollowSameHour: { total: 0, search: 0, show: 0, updates: 0 },
      daily: { total: 1, search: 0, show: 0, updates: 1 },
      // A (re)follow wants a snapshot checked within the hour; one fetch per show per hour at most.
      refollowNextDay: { total: 1, search: 0, show: 1, updates: 0 },
    });
    // Google traffic is real but separate: both users got their own items.
    expect(calendars.a.writes.length).toBeGreaterThan(0); expect(calendars.b.writes.length).toBeGreaterThan(0);
    expect(await getFollowerCounts(db, "a")).toEqual([{ tvmazeId: 45039, title: "Slow Horses", followers: 2 }]);
  });
});
