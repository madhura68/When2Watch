import { afterEach, expect, it } from "vitest";
import { GoogleCalendar } from "@/server/google-calendar";
import { SyncService } from "@/server/sync";
import { parseSnapshot } from "@/server/tvmaze";
import { readbackNeedsAttention, readbackOwnEvents, readOnlyFetch } from "../../scripts/migration/readback";
import { testDatabase } from "../database";
import { bindCalendar } from "../fixtures/users";
import { simulatedCalendar } from "../simulated-calendar";
import raw from "../fixtures/tvmaze/slow-horses.json";

let storage: ReturnType<typeof testDatabase>;
afterEach(async () => { await storage?.close(); });
const config = { calendarId: "chosen@example.test", timeZone: "Europe/Amsterdam" }, now = new Date("2026-09-24T07:00:00Z");

async function migratedOwner() {
  storage = testDatabase(); const db = storage.db, google = simulatedCalendar();
  await db.user.create({ data: { id: "owner", email: "owner@example.test" } });
  await bindCalendar(db, "owner", config.calendarId);
  const calendar = new GoogleCalendar(async () => "synthetic-access", google.fetcher);
  expect((await new SyncService(db, calendar, { snapshot: async () => parseSnapshot(raw, 45039) }, config, () => now).add("owner", 45039)).status).toBe("success");
  google.writes.length = 0;
  return { db, google, readOnly: new GoogleCalendar(async () => "synthetic-access", readOnlyFetch(google.fetcher)) };
}

it("confirms every existing own event by GET only, without Calendar or database writes", async () => {
  const { db, google, readOnly } = await migratedOwner();
  const links = await db.calendarEventLink.findMany({ orderBy: { id: "asc" } }), accounts = await db.account.findMany();
  const report = await readbackOwnEvents(db, readOnly, "owner", config.calendarId);
  expect(report).toEqual({ links: links.length, unchanged: links.length, remoteChanged: 0, sourceChanged: 0, missing: 0, foreign: 0, pending: 0, deleted: 0, otherCalendar: 0 });
  expect(links.length).toBeGreaterThan(0);
  expect(readbackNeedsAttention(report)).toBe(false);
  expect(readbackNeedsAttention({ ...report, pending: 1 })).toBe(true);
  expect(google.writes).toEqual([]);
  expect(await db.calendarEventLink.findMany({ orderBy: { id: "asc" } })).toEqual(links);
  expect(await db.account.findMany()).toEqual(accounts);
});

it("separates remote edits, source changes, missing events, foreign markers and pending intentions", async () => {
  const { db, google, readOnly } = await migratedOwner();
  const [a, b, c, d, e] = await db.calendarEventLink.findMany({ orderBy: { id: "asc" } });
  google.events.set(a.eventId, { ...google.events.get(a.eventId), summary: "edited in Google" });
  await db.catalogEpisode.update({ where: { id: b.catalogEpisodeId! }, data: { title: "Renamed by TVmaze" } });
  google.events.set(c.eventId, { id: c.eventId, status: "cancelled" });
  const other = google.events.get(d.eventId);
  google.events.set(d.eventId, { ...other, extendedProperties: { private: { ...other.extendedProperties.private, userId: "someone-else" } } });
  await db.calendarEventLink.update({ where: { id: e.id }, data: { status: "prepared" } });
  const older = await db.calendarBinding.create({ data: { userId: "owner", calendarId: "older@example.test", status: "LEGACY_UNRESOLVED", provenance: "LEGACY_UNVERIFIED" } });
  await db.calendarEventLink.create({ data: { userId: "owner", bindingId: older.id, catalogEpisodeId: a.catalogEpisodeId, calendarId: "older@example.test", eventId: "older-event", status: "synced", desiredJson: "{}" } });
  const report = await readbackOwnEvents(db, readOnly, "owner", config.calendarId);
  expect(report).toMatchObject({ remoteChanged: 1, sourceChanged: 1, missing: 1, foreign: 1, pending: 1, otherCalendar: 1 });
  expect(readbackNeedsAttention(report)).toBe(true);
  expect(google.writes).toEqual([]);
});

it("refuses any Calendar mutation through the read-only fetcher", async () => {
  const fetcher = readOnlyFetch(async () => Response.json({}));
  await expect(fetcher("https://www.googleapis.com/calendar/v3/calendars/x/events", { method: "POST" })).rejects.toThrow(/read-only/);
  await expect(fetcher("https://www.googleapis.com/calendar/v3/calendars/x/events/y", { method: "DELETE" })).rejects.toThrow(/read-only/);
});
