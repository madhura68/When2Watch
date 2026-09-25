import { afterEach, expect, it } from "vitest";
import { GoogleCalendar } from "@/server/google-calendar";
import { CalendarSettingsService } from "@/server/calendar-settings";
import { CalendarProbeService } from "@/server/calendar-probe";
import { GoogleConnectionService } from "@/server/google-connection";
import { getActiveBinding } from "@/server/calendar-bindings";
import { userSettings } from "@/server/installation";
import { overview } from "@/server/overview";
import { getPreferences, savePreferences } from "@/server/preferences";
import { calendarScopes } from "@/server/auth-policy";
import { testDatabase } from "./database";
import { activeUser, installation } from "./fixtures/users";
import { simulatedCalendar } from "./simulated-calendar";

let storage: ReturnType<typeof testDatabase>;
afterEach(async () => { await storage?.close(); });

async function twoUsers() {
  storage = testDatabase(); const db = storage.db;
  const a = await activeUser(db, "a", { role: "ADMIN", calendarId: null }), b = await activeUser(db, "b", { calendarId: "b-cal@example.test" });
  await installation(db, "a");
  for (const user of ["a", "b"]) await db.session.create({ data: { userId: user, sessionToken: `session-${user}`, expires: new Date(Date.now() + 3_600_000) } });
  return { db, a, b };
}
const google = (fetcher: typeof fetch) => () => new GoogleCalendar(async () => "synthetic-access", fetcher);

it("keeps calendar choice, binding and settings per user", async () => {
  const { db, b } = await twoUsers(), calendar = simulatedCalendar();
  const settings = new CalendarSettingsService(db, google(calendar.fetcher));
  // A calendar A's account created itself (proven), then chosen by ID.
  await db.calendarCreationAttempt.create({ data: { id: "creation-a", ownerId: "a", accountId: "acc-a", name: "When2Watch", timeZone: "Europe/Amsterdam", status: "ready", calendarId: "chosen@example.test" } });
  await settings.select("a", "chosen@example.test");
  const bindingA = await getActiveBinding(db, "a"), bindingB = await getActiveBinding(db, "b");
  expect(bindingA).toMatchObject({ binding: { userId: "a", calendarId: "chosen@example.test", accountId: "acc-a" }, account: { id: "acc-a" } });
  expect(bindingB).toMatchObject({ binding: { id: b.binding!.id, calendarId: "b-cal@example.test" }, account: { id: "acc-b" } });
  const [viewA, viewB] = [await userSettings(db, "a"), await userSettings(db, "b")];
  expect(viewA).toMatchObject({ account: { email: "a@example.test" }, calendar: { id: "chosen@example.test" }, isAdmin: true });
  expect(viewB).toMatchObject({ account: { email: "b@example.test" }, calendar: { id: "b-cal@example.test" }, isAdmin: false });
  expect(JSON.stringify(viewA)).not.toContain("b-cal@example.test");
});

it("reports an explicit unconfigured state instead of borrowing another user's calendar", async () => {
  const { db } = await twoUsers();
  expect(await getActiveBinding(db, "a")).toEqual({ unconfigured: true });
});

it("keeps probes, preferences and series private; another user's object is a neutral 404", async () => {
  const { db } = await twoUsers(), calendar = simulatedCalendar();
  const probeB = new CalendarProbeService(db, new GoogleCalendar(async () => "synthetic-access", calendar.fetcher), { calendarId: "b-cal@example.test", timeZone: "Europe/Amsterdam" });
  await db.probe.create({ data: { id: "probe-b", userId: "b", calendarId: "b-cal@example.test", eventId: "pb", date: "2026-10-01", requestJson: "{}" } });
  await expect(probeB.remove("a", "probe-b")).rejects.toMatchObject({ status: 404 });
  expect((await db.probe.findUniqueOrThrow({ where: { id: "probe-b" } })).status).toBe("prepared");

  await savePreferences("a", { agendaMonths: 3 }, db);
  expect(await getPreferences("b", db)).toEqual({ agendaMonths: 1, timeZone: "Europe/Amsterdam" });

  await db.trackedShow.create({ data: { userId: "b", tvmazeId: 45039, title: "Private to B", sourceUrl: "x", status: "Running" } });
  expect(JSON.stringify(await overview("a", db))).not.toContain("Private to B");
});

it("refuses another user's Google identity when connecting a calendar account", async () => {
  const { db } = await twoUsers(), connections = new GoogleConnectionService(db);
  const account = (sub: string) => ({ provider: "google", providerAccountId: sub, type: "oauth" as const, scope: calendarScopes.join(" ") });
  const profile = { email: "someone@example.test", email_verified: true };
  for (const mode of ["calendar", "candidate"] as const) {
    const attempt = await connections.begin("a", "session-a", { mode });
    expect(await connections.accepts(attempt.id, "session-a", account("sub-b"), profile)).toBe(false);
  }
  const attempt = await connections.begin("a", "session-a", { mode: "calendar" });
  expect(await connections.accepts(attempt.id, "session-a", account("sub-a"), profile)).toBe(true);
  // A session of B cannot drive A's attempt.
  await expect(connections.validate(attempt.id, "session-b")).rejects.toMatchObject({ code: "CONNECTION_EXPIRED" });
});

it("allows replacing the central OAuth client only for an admin", async () => {
  const { db } = await twoUsers(), connections = new GoogleConnectionService(db);
  await expect(connections.begin("b", "session-b", { mode: "replace-client", clientId: "other.apps.googleusercontent.com", clientSecret: "x" })).rejects.toMatchObject({ status: 403 });
  expect(await db.oAuthClientConfig.count()).toBe(1);
});

