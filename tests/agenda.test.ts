import { afterEach, describe, expect, it, vi } from "vitest";
import { agendaWindow } from "@/lib/agenda-range";
import { agendaOverview } from "@/server/agenda";
import { savePreferences } from "@/server/preferences";
import { testDatabase } from "./database";
import { bindCalendar } from "./fixtures/users";
import { SyncService } from "@/server/sync";
import { GoogleCalendar } from "@/server/google-calendar";
import { parseSnapshot } from "@/server/tvmaze";
import { simulatedCalendar } from "./simulated-calendar";
import raw from "./fixtures/tvmaze/slow-horses.json";

describe("calendar-month Agenda window", () => {
  it.each([
    ["2026-09-24T12:00:00Z", "Europe/Amsterdam", 1, "2026-09-24", "2026-10-24"],
    ["2026-01-31T12:00:00Z", "Europe/Amsterdam", 1, "2026-01-31", "2026-02-28"],
    ["2028-01-31T12:00:00Z", "Europe/Amsterdam", 1, "2028-01-31", "2028-02-29"],
    ["2026-11-30T12:00:00Z", "Europe/Amsterdam", 3, "2026-11-30", "2027-02-28"],
    ["2026-12-31T12:00:00Z", "Europe/Amsterdam", 2, "2026-12-31", "2027-02-28"],
    ["2026-03-28T23:30:00Z", "Europe/Amsterdam", 1, "2026-03-29", "2026-04-29"],
    ["2026-10-25T22:59:00Z", "Europe/Amsterdam", 1, "2026-10-25", "2026-11-25"],
    ["2026-10-25T23:01:00Z", "Europe/Amsterdam", 1, "2026-10-26", "2026-11-26"],
    ["2026-09-24T00:30:00Z", "America/New_York", 1, "2026-09-23", "2026-10-23"],
  ] as const)("clamps months and uses the configured local day: %s, %s, %s", (now, zone, months, from, untilExclusive) => {
    expect(agendaWindow(new Date(now), zone, months)).toEqual({ from, untilExclusive });
  });
});

describe("local Agenda reads", () => {
  let storage: ReturnType<typeof testDatabase> | undefined;
  afterEach(async () => { vi.unstubAllGlobals(); await storage?.close(); });
  it("includes today, excludes the end and missing/deleted dates, orders stably and scopes the owner", async () => {
    storage = testDatabase(); const db = storage.db;
    await db.user.createMany({ data: [{ id: "owner" }, { id: "other" }] });
    for (const [userId, title, tvmazeId] of [["owner", "Zebra", 1], ["owner", "Alpha", 2], ["other", "Private", 3]] as const) {
      const show = await db.catalogShow.create({ data: { title, tvmazeId, status: "Running", sourceUrl: "https://www.tvmaze.com/shows/1", lastSuccessAt: new Date() } });
      await db.userFollow.create({ data: { userId, catalogShowId: show.id } });
      await db.catalogEpisode.createMany({ data: [
        { sourceId: 1, title: "Today second", airdate: "2026-09-24", season: 1, number: 2, present: true },
        { sourceId: 2, title: "Today first", airdate: "2026-09-24", season: 1, number: 1, present: true },
        { sourceId: 3, title: "Last included", airdate: "2026-10-23", present: true },
        { sourceId: 4, title: "Excluded end", airdate: "2026-10-24", present: true },
        { sourceId: 5, title: "Yesterday", airdate: "2026-09-23", present: true },
        { sourceId: 6, title: "Unknown", airdate: null, present: true },
        { sourceId: 7, title: "Removed", airdate: "2026-09-25", present: false },
      ].map(e => ({ ...e, catalogShowId: show.id, sourceUrl: `https://www.tvmaze.com/episodes/${e.sourceId}` })) });
    }
    vi.stubGlobal("fetch", () => { throw new Error("Agenda must not call a provider"); });
    const result = await agendaOverview("owner", new Date("2026-09-24T12:00:00Z"), db);
    expect(result.window).toEqual({ from: "2026-09-24", untilExclusive: "2026-10-24" });
    expect(result.groups.map(g => g.date)).toEqual(["2026-09-24", "2026-10-23"]);
    expect(result.groups[0].episodes.map(e => `${e.show.title}: ${e.title}`)).toEqual(["Alpha: Today first", "Alpha: Today second", "Zebra: Today first", "Zebra: Today second"]);
    expect(result.groups.flatMap(g => g.episodes).every(e => !e.linked && e.show.title !== "Private")).toBe(true);
    expect((await agendaOverview("nobody", new Date("2026-09-24T12:00:00Z"), db)).groups).toEqual([]);
    expect(await db.userPreferences.count()).toBe(0);
  });

  it("changes only the visible horizon and preserves event identities, hashes and Google writes after reopen", async () => {
    storage = testDatabase(); const db = storage.db, google = simulatedCalendar();
    await db.user.create({ data: { id: "owner" } });
    const config = { calendarId: "chosen@example.test", timeZone: "Europe/Amsterdam" };
    await bindCalendar(db, "owner", config.calendarId);
    const now = new Date("2026-09-24T07:00:00Z"); let sourceCalls = 0;
    const service = new SyncService(db, new GoogleCalendar(async () => "synthetic-access", google.fetcher), { snapshot: async () => { sourceCalls++; return parseSnapshot(raw, 45039); } }, config, () => now);
    expect((await service.add("owner", 45039)).status).toBe("success");
    const before = await db.calendarEventLink.findMany({ orderBy: { id: "asc" } });
    const events = structuredClone([...google.events.entries()]); google.writes.length = 0;
    await savePreferences("owner", { agendaMonths: 3 }, db);
    await db.$disconnect(); const reopened = storage.reopen();
    try {
      const wide = await agendaOverview("owner", now, reopened);
      expect(wide.preferences.agendaMonths).toBe(3);
      expect(wide.groups.flatMap(g => g.episodes).filter(e => e.linked).map(e => e.id)).toEqual([3643507, 3643508, 3643509, 3643510]);
      await savePreferences("owner", { agendaMonths: 1 }, reopened);
      await agendaOverview("owner", now, reopened);
      expect(await reopened.calendarEventLink.findMany({ orderBy: { id: "asc" } })).toEqual(before);
      expect([...google.events.entries()]).toEqual(events);
      expect(google.writes).toEqual([]); expect(sourceCalls).toBe(1);
    } finally { await reopened.$disconnect(); }
  });
});
