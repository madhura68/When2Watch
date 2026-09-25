import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { GoogleCalendar } from "@/server/google-calendar";
import { CalendarProbeService } from "@/server/calendar-probe";
import { testDatabase } from "./database";
import { bindCalendar } from "./fixtures/users";

const calendarId = "chosen@group.calendar.google.com";
const chosen = { calendarId, timeZone: "Europe/Amsterdam" };
const now = new Date("2026-09-23T12:00:00Z");

// Synthetic Google transport; these tests do not prove real client reminders.
function simulatedGoogle() {
  const events = new Map<string, Record<string, any>>();
  const writes: string[] = [];
  let role = "owner";
  let loseInsertResponse = false;
  let insertPause: { entered: () => void; wait: Promise<void> } | null = null;
  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    expect(url.origin).toBe("https://www.googleapis.com");
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer test-access");
    const method = init?.method ?? "GET";
    if (url.pathname.includes("/users/me/calendarList/")) {
      expect(decodeURIComponent(url.pathname.split("/").at(-1)!)).toBe(calendarId);
      return Response.json({ id: calendarId, summary: "When2Watch", timeZone: chosen.timeZone, accessRole: role, defaultReminders: [] });
    }
    expect(decodeURIComponent(url.pathname.split("/calendars/")[1].split("/events")[0])).toBe(calendarId);
    const id = url.pathname.split("/").at(-1)!;
    if (method === "POST") {
      const event = JSON.parse(String(init?.body));
      writes.push(`insert:${event.id}`);
      if (insertPause) {
        const gate = insertPause; insertPause = null;
        gate.entered(); await gate.wait;
      }
      if (events.has(event.id)) return Response.json({}, { status: 409 });
      events.set(event.id, { ...event, etag: '"version-1"', status: "confirmed" });
      if (loseInsertResponse) { loseInsertResponse = false; throw new TypeError("network connection lost after insert"); }
      return Response.json(events.get(event.id));
    }
    if (method === "DELETE") {
      writes.push(`delete:${id}`);
      expect(new Headers(init?.headers).get("if-match")).toBe('"version-1"');
      events.delete(id);
      return new Response(null, { status: 204 });
    }
    return events.has(id) ? Response.json(events.get(id)) : Response.json({}, { status: 404 });
  };
  return { events, writes, fetcher, role: (value: string) => { role = value; }, loseResponse: () => { loseInsertResponse = true; },
    pauseNextInsert: () => {
      let entered!: () => void;
      let resume!: () => void;
      const waiting = new Promise<void>((resolve) => { entered = resolve; });
      const wait = new Promise<void>((resolve) => { resume = resolve; });
      insertPause = { entered, wait };
      return { waiting, resume };
    },
  };
}

describe("Calendar trial using real SQLite and simulated Google HTTP", () => {
  let database: ReturnType<typeof testDatabase>;
  let google: ReturnType<typeof simulatedGoogle>;
  let service: CalendarProbeService;
  beforeAll(async () => {
    database = testDatabase();
    await database.db.user.create({ data: { id: "owner", email: "owner@example.com" } });
    await database.db.user.create({ data: { id: "other", email: "other@example.com" } });
  });
  beforeEach(async () => {
    await database.db.probe.deleteMany();
    await database.db.calendarBinding.deleteMany();
    await bindCalendar(database.db, "owner", calendarId);
    google = simulatedGoogle();
    service = new CalendarProbeService(database.db, new GoogleCalendar(async () => "test-access", google.fetcher), chosen, () => now);
  });
  afterAll(async () => { await database?.close(); });

  it("saves only the explicitly chosen writable calendar", async () => {
    const calendar = await service.verifyCalendar("owner");
    expect(calendar.calendarId).toBe(calendarId);
    expect(calendar.timeZone).toBe("Europe/Amsterdam");
    google.role("reader");
    await expect(service.verifyCalendar("owner")).rejects.toMatchObject({ code: "CALENDAR_NOT_WRITABLE" });
    await expect(service.create("owner", "2026-09-24")).rejects.toMatchObject({ code: "CALENDAR_NOT_WRITABLE" });
    expect(google.writes).toEqual([]);
  });

  it("requires the user's own active calendar before creating an event", async () => {
    await database.db.calendarBinding.deleteMany();
    await expect(service.create("owner", "2026-09-24")).rejects.toMatchObject({ code: "CALENDAR_NOT_CONFIRMED" });
    expect(google.writes).toEqual([]);
  });

  it("creates and reads back a marked all-day event with an exclusive end date and no negative reminders", async () => {
    await service.verifyCalendar("owner");
    const probe = await service.create("owner", "2026-09-24");
    const request = JSON.parse(probe.requestJson);
    expect(request.start).toEqual({ date: "2026-09-24" });
    expect(request.end).toEqual({ date: "2026-09-25" });
    expect(request.reminders).toEqual({ useDefault: true });
    expect(request.extendedProperties.private).toMatchObject({ app: "when2watch", kind: "probe", userId: "owner", probeId: probe.id });
    expect(probe.eventId).toMatch(/^[0-9a-v]{5,1024}$/);
    expect(probe.status).toBe("created");
    expect(JSON.parse(probe.readbackJson!)).toMatchObject({ id: probe.eventId, start: { date: "2026-09-24" } });
    expect(probe.readbackJson).not.toContain("test-access");
    expect((await service.create("owner", "2026-09-24")).id).toBe(probe.id);
    expect(google.writes).toHaveLength(1);
  });

  it("recovers an uncertain insert after reopening storage without duplicating the event", async () => {
    await service.verifyCalendar("owner");
    google.loseResponse();
    await expect(service.create("owner", "2026-09-24")).rejects.toMatchObject({ code: "GOOGLE_UNAVAILABLE" });
    const reopened = database.reopen();
    try {
      const retried = new CalendarProbeService(reopened, new GoogleCalendar(async () => "test-access", google.fetcher), chosen, () => now);
      expect((await retried.create("owner", "2026-09-24")).status).toBe("created");
      expect(google.events.size).toBe(1);
      expect(google.writes).toHaveLength(1);
    } finally { await reopened.$disconnect(); }
  });

  it("rejects invalid or past calendar dates before touching Google", async () => {
    await service.verifyCalendar("owner");
    for (const date of ["2026-02-30", "2026-9-24", "2026-09-22", "2026-09-24T09:00:00Z"]) {
      await expect(service.create("owner", date)).rejects.toMatchObject({ code: "INVALID_DATE" });
    }
    expect(google.events.size).toBe(0);
  });

  it("can resume an existing uncertain request the next morning", async () => {
    await service.verifyCalendar("owner");
    google.loseResponse();
    await expect(service.create("owner", "2026-09-24")).rejects.toMatchObject({ code: "GOOGLE_UNAVAILABLE" });
    const morning = new CalendarProbeService(database.db, new GoogleCalendar(async () => "test-access", google.fetcher), chosen, () => new Date("2026-09-24T05:00:00Z"));
    expect((await morning.create("owner", "2026-09-24")).status).toBe("created");
    expect(google.events.size).toBe(1);
    expect(google.writes).toHaveLength(1);
  });

  it("finishes an in-flight creation before reporting cleanup from another tab", async () => {
    await service.verifyCalendar("owner");
    const gate = google.pauseNextInsert();
    const creation = service.create("owner", "2026-09-24");
    await gate.waiting;
    const probe = await database.db.probe.findFirstOrThrow();
    const otherTab = new CalendarProbeService(database.db, new GoogleCalendar(async () => "test-access", google.fetcher), chosen, () => now);
    const cleanup = otherTab.remove("owner", probe.id);
    // Give the old unprotected deletion a chance to finish against Google's 404.
    // With exclusion, cleanup must wait; then release the simulated slow insert.
    await Promise.race([cleanup, new Promise((resolve) => setTimeout(resolve, 100))]);
    gate.resume();
    await Promise.all([creation, cleanup]);
    expect(google.events.size).toBe(0);
    expect((await database.db.probe.findUniqueOrThrow({ where: { id: probe.id } })).status).toBe("deleted");
  });

  it("cleans up only the persisted, owned event and refuses changed ownership", async () => {
    await service.verifyCalendar("owner");
    const probe = await service.create("owner", "2026-09-24");
    await expect(service.remove("other", probe.id)).rejects.toMatchObject({ code: "PROBE_NOT_FOUND" });
    const event = google.events.get(probe.eventId)!;
    const original = structuredClone(event);
    event.extendedProperties.private.app = "unrelated-app";
    await expect(service.remove("owner", probe.id)).rejects.toMatchObject({ code: "EVENT_NOT_OWNED" });
    expect(google.events.size).toBe(1);
    google.events.set(probe.eventId, original);
    await service.remove("owner", probe.id);
    expect(google.events.size).toBe(0);
    expect((await database.db.probe.findUniqueOrThrow({ where: { id: probe.id } })).status).toBe("deleted");
    await service.remove("owner", probe.id);
    expect(google.writes.filter((write) => write.startsWith("delete:"))).toHaveLength(1);
  });
});
