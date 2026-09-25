import { afterEach, expect, it } from "vitest";
import { getPreferences, savePreferences } from "@/server/preferences";
import { legacySqliteDatabase, testDatabase } from "./database";

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

it("adds preferences to a populated old SQLite database while preserving owner, episodes and event mappings", () => {
  const migration = "20260924120000_user_preferences", legacy = legacySqliteDatabase(migration);
  try {
    legacy.sqlite.exec(`INSERT INTO User(id,email) VALUES ('existing-owner','owner@example.test')`);
    legacy.sqlite.exec(`INSERT INTO TrackedShow(id,userId,tvmazeId,title,status,sourceUrl) VALUES ('old-show','existing-owner',45039,'Slow Horses','Running','https://www.tvmaze.com/shows/45039')`);
    legacy.sqlite.exec(`INSERT INTO Episode(id,trackedShowId,sourceId,title,airdate,sourceUrl) VALUES ('old-episode','old-show',123,'Existing','2026-09-30','https://www.tvmaze.com/episodes/123')`);
    legacy.sqlite.exec(`INSERT INTO CalendarEventLink(id,episodeId,calendarId,eventId,status,desiredJson,confirmedDesiredHash) VALUES ('old-link','old-episode','test','unchanged','synced','{}','unchanged-hash')`);
    const tables = ["User", "TrackedShow", "Episode", "CalendarEventLink"], read = () => tables.map(table => legacy.all(`SELECT * FROM "${table}"`));
    const before = read();
    legacy.applyMigration(migration);
    expect(read()).toEqual(before);
    expect(legacy.all(`SELECT count(*) AS n FROM UserPreferences`)).toEqual([{ n: 0 }]);
  } finally { legacy.close(); }
});
