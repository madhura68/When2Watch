import { afterEach, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { GoogleCalendar } from "@/server/google-calendar";
import { CalendarSettingsService } from "@/server/calendar-settings";
import { importLegacyInstallation } from "@/server/installation";
import { calendarScopes, calendarCreationScope } from "@/server/auth-policy";
import { testDatabase } from "./database";

let storage: ReturnType<typeof testDatabase>;
afterEach(async () => { await storage?.close(); });
const calendar = { id: "new-calendar", summary: "My shows", timeZone: "America/New_York", accessRole: "owner", defaultReminders: [] };
async function fixture(fetcher: typeof fetch) {
  storage = testDatabase(); const db = storage.db;
  await db.user.create({ data: { id: "owner", email: "owner@example.test" } });
  await db.account.create({ data: { id: "account", userId: "owner", provider: "google", providerAccountId: "subject", type: "oauth",
    refresh_token: "synthetic", scope: [...calendarScopes, calendarCreationScope].join(" ") } });
  await importLegacyInstallation(db, { allowedEmail: "owner@example.test", clientId: "synthetic-client", clientSecret: "synthetic-secret" });
  const google = new GoogleCalendar(async () => "synthetic", fetcher);
  return { db, google, service: new CalendarSettingsService(db, () => google) };
}

it("continues the real B0 empty first page and lists every writable calendar", async () => {
  const pages = [1, 2, 3].map(i => JSON.parse(readFileSync(`tests/fixtures/google/calendar-list-source-${i}.json`, "utf8")));
  let count = 0;
  const google = new GoogleCalendar(async () => "synthetic", async input => {
    const url = new URL(String(input));
    expect(url.searchParams.get("minAccessRole")).toBe("writer");
    if (count) expect(url.searchParams.get("pageToken")).toBe(pages[count - 1].nextPageToken);
    return Response.json(pages[count++]);
  });
  const result = await google.calendars();
  expect(count).toBe(3); expect(result).toHaveLength(2);
  expect(result[1].id).toBe(pages[2].items[0].id);
});

it("persists creation intent before POST and returns the same calendar after double submission or restart", async () => {
  let posts = 0;
  const { db, service, google } = await fixture(async (_input, init) => {
    if (init?.method === "POST") {
      posts++;
      expect(await storage.db.calendarCreationAttempt.count({ where: { status: "sending" } })).toBe(1);
      return Response.json(calendar);
    }
    return Response.json(calendar);
  });
  const input = { requestId: "creation-1", name: calendar.summary, timeZone: calendar.timeZone };
  await Promise.all([service.create("owner", input), service.create("owner", input)]);
  expect(posts).toBe(1);
  const reopened = storage.reopen();
  try { await new CalendarSettingsService(reopened, () => google).create("owner", input); }
  finally { await reopened.$disconnect(); }
  expect(posts).toBe(1);
  await service.select("owner", calendar.id);
  expect(await db.calendarSettings.findUnique({ where: { userId: "owner" } })).toMatchObject({ calendarId: calendar.id, timeZone: calendar.timeZone });
  expect((await db.calendarCreationAttempt.findUniqueOrThrow({ where: { id: input.requestId } })).status).toBe("selected");
});

it("does not repeat an uncertain calendar POST, even under a new request ID, and recovers through explicit ID selection", async () => {
  let posts = 0;
  const { db, service } = await fixture(async (_input, init) => {
    if (init?.method === "POST") { posts++; throw new Error("response lost after provider commit"); }
    return Response.json(calendar);
  });
  const input = { requestId: "uncertain-1", name: calendar.summary, timeZone: calendar.timeZone };
  await expect(service.create("owner", input)).rejects.toMatchObject({ code: "CALENDAR_CREATION_UNCERTAIN" });
  await expect(service.create("owner", input)).rejects.toMatchObject({ code: "CALENDAR_CREATION_UNCERTAIN" });
  await expect(service.create("owner", { ...input, requestId: "new-request-id" })).rejects.toMatchObject({ code: "CALENDAR_CREATION_PENDING" });
  expect(posts).toBe(1);
  await service.select("owner", calendar.id);
  expect((await db.calendarCreationAttempt.findUniqueOrThrow({ where: { id: input.requestId } })).status).toBe("selected");
});

it("cannot replace an existing destination through the first-choice endpoint", async () => {
  const { db, service } = await fixture(async () => Response.json(calendar));
  await db.calendarSettings.create({ data: { userId: "owner", calendarId: "existing", summary: "Existing", timeZone: "UTC", accessRole: "owner", defaultRemindersJson: "[]" } });
  await expect(service.select("owner", calendar.id)).rejects.toMatchObject({ code: "CALENDAR_TRANSITION_REQUIRED" });
  expect((await db.calendarSettings.findUniqueOrThrow({ where: { userId: "owner" } })).calendarId).toBe("existing");
});
