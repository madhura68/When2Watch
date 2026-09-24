import { afterEach, expect, it } from "vitest";
import { getPreferences, savePreferences } from "@/server/preferences";
import { testDatabase } from "./database";

let storage: ReturnType<typeof testDatabase> | undefined;
afterEach(async () => { await storage?.close(); });

it("reads defaults without writing and persists only the selected owner's valid preference", async () => {
  storage = testDatabase(); const db = storage.db;
  await db.user.createMany({ data: [{ id: "owner" }, { id: "other" }] });
  expect(await getPreferences("owner", db)).toEqual({ agendaMonths: 1, timeZone: "Europe/Amsterdam" });
  expect(await db.userPreferences.count()).toBe(0);
  await savePreferences("owner", { agendaMonths: 2 }, db);
  await db.$disconnect(); const reopened = storage.reopen();
  try {
    expect(await getPreferences("owner", reopened)).toEqual({ agendaMonths: 2, timeZone: "Europe/Amsterdam" });
    expect(await getPreferences("other", reopened)).toEqual({ agendaMonths: 1, timeZone: "Europe/Amsterdam" });
    expect(await reopened.userPreferences.count()).toBe(1);
  } finally { await reopened.$disconnect(); }
});

it.each([null, [], {}, { agendaMonths: 0 }, { agendaMonths: 4 }, { agendaMonths: 1.5 }, { agendaMonths: "2" }, { agendaMonths: true }, { agendaMonths: 2, userId: "other" }, { agendaMonths: 2, timeZone: "Invalid/Zone" }])("rejects unsupported or ambiguous preference input: %j", async input => {
  await expect(savePreferences("owner", input)).rejects.toMatchObject({ code: "INVALID_INPUT", status: 400 });
});

it("persists a valid timezone independently without resetting the chosen horizon", async () => {
  storage = testDatabase(); await storage.db.user.create({ data: { id: "owner" } });
  await savePreferences("owner", { agendaMonths: 3 }, storage.db);
  expect(await savePreferences("owner", { timeZone: "America/Los_Angeles" }, storage.db)).toEqual({ agendaMonths: 3, timeZone: "America/Los_Angeles" });
});

it("adds preferences to a populated old database while preserving owner, episodes and event mappings", async () => {
  const migration = "20260924120000_user_preferences"; storage = testDatabase(migration); const db = storage.db;
  await db.user.create({ data: { id: "existing-owner", email: "owner@example.test" } });
  await db.$executeRaw`INSERT INTO TrackedShow(id,userId,tvmazeId,title,status,sourceUrl) VALUES ('old-show','existing-owner',45039,'Slow Horses','Running','https://www.tvmaze.com/shows/45039')`;
  const show = {id:"old-show"};
  const episode = await db.episode.create({ data: { trackedShowId: show.id, sourceId: 123, title: "Existing", airdate: "2026-09-30", sourceUrl: "https://www.tvmaze.com/episodes/123" } });
  await db.calendarEventLink.create({ data: { episodeId: episode.id, calendarId: "test", eventId: "unchanged", status: "synced", desiredJson: "{}", confirmedDesiredHash: "unchanged-hash" } });
  const before = { users: await db.user.findMany(), shows: await db.$queryRaw`SELECT * FROM TrackedShow`, episodes: await db.episode.findMany(), links: await db.calendarEventLink.findMany() };
  storage.applyMigration(migration);
  expect({ users: await db.user.findMany(), shows: await db.$queryRaw`SELECT * FROM TrackedShow`, episodes: await db.episode.findMany(), links: await db.calendarEventLink.findMany() }).toEqual(before);
  expect(await getPreferences("existing-owner", db)).toEqual({ agendaMonths: 1, timeZone: "Europe/Amsterdam" });
  expect(await db.userPreferences.count()).toBe(0);
});
