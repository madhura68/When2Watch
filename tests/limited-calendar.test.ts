import { afterEach, describe, expect, it, vi } from "vitest";
import raw from "./fixtures/tvmaze/slow-horses.json";
import { GoogleCalendar } from "@/server/google-calendar";
import { CalendarSettingsService, normalizeCalendarName } from "@/server/calendar-settings";
import { GoogleConnectionService } from "@/server/google-connection";
import { SyncService } from "@/server/sync";
import { overview } from "@/server/overview";
import { serializeCalendarMutation } from "@/server/calendar-mutations";
import { parseSnapshot } from "@/server/tvmaze";
import { calendarScopes, hasCalendarScopes } from "@/server/auth-policy";
import { testDatabase } from "./database";
import { activeUser, installation } from "./fixtures/users";

let storage: ReturnType<typeof testDatabase>;
vi.mock("@/server/db", () => ({ database: () => storage.db }));
const { authOptions } = await import("@/server/auth");
afterEach(async () => { await storage?.close(); vi.unstubAllEnvs(); });
const narrow = "https://www.googleapis.com/auth/calendar.calendarlist.readonly https://www.googleapis.com/auth/calendar.app.created";

/** Google with only app.created semantics: the app can only read/write calendars it created. */
function limitedGoogle(options: { existing?: { id: string; summary: string }[]; losePost?: boolean; forbidden?: boolean } = {}) {
  const calendars = new Map((options.existing ?? []).map(c => [c.id, { ...c, appCreated: false, timeZone: "Europe/Amsterdam", accessRole: "owner" }]));
  const posts: string[] = [];
  let lose = options.losePost ?? false, next = 0;
  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(String(input)), method = init?.method ?? "GET";
    if (url.pathname.endsWith("/users/me/calendarList")) {
      const all = [...calendars.values()], offset = Number(url.searchParams.get("pageToken") ?? 0);
      return Response.json({ items: all.slice(offset, offset + 1).map(({ appCreated, ...c }) => c), ...(offset + 1 < all.length ? { nextPageToken: String(offset + 1) } : {}) });
    }
    if (url.pathname.includes("/users/me/calendarList/")) {
      const c = calendars.get(decodeURIComponent(url.pathname.split("/calendarList/")[1]));
      if (!c || !c.appCreated) return Response.json({}, { status: 404 });
      const { appCreated, ...rest } = c; return Response.json({ ...rest, defaultReminders: [] });
    }
    if (method === "POST" && url.pathname.endsWith("/calendars")) {
      const body = JSON.parse(String(init?.body)); posts.push(body.summary);
      const id = `app-${++next}@group.calendar.google.com`;
      calendars.set(id, { id, summary: body.summary, timeZone: body.timeZone, accessRole: "owner", appCreated: true });
      if (lose) { lose = false; throw new Error("response lost after Google committed"); }
      return Response.json({ id, summary: body.summary, timeZone: body.timeZone });
    }
    if (options.forbidden) return Response.json({}, { status: 403 });
    return Response.json({ items: [] });
  };
  return { fetcher, posts, calendars, rename: (id: string, summary: string) => { calendars.get(id)!.summary = summary; } };
}

async function setup(google: ReturnType<typeof limitedGoogle>, options: { calendarId?: string | null; scope?: string } = {}) {
  storage = testDatabase(); const db = storage.db;
  await activeUser(db, "a", { role: "ADMIN", calendarId: options.calendarId ?? null, scope: options.scope ?? narrow }); await installation(db, "a");
  const calendar = new GoogleCalendar(async () => "synthetic-access", google.fetcher);
  return { db, calendar, settings: new CalendarSettingsService(db, () => calendar) };
}

describe("narrow scopes", () => {
  it("requests only calendarlist.readonly and app.created for Calendar and never folds in older grants", async () => {
    expect([...calendarScopes]).toEqual(narrow.split(" "));
    expect(hasCalendarScopes(`${narrow} openid`)).toBe(true);
    expect(hasCalendarScopes("https://www.googleapis.com/auth/calendar.calendarlist.readonly https://www.googleapis.com/auth/calendar.events")).toBe(false);
    vi.stubEnv("NEXTAUTH_URL", "https://when2watch.example.test"); vi.stubEnv("NEXTAUTH_SECRET", "synthetic-session-secret");
    const { db } = await setup(limitedGoogle());
    await db.session.create({ data: { userId: "a", sessionToken: "s", expires: new Date(Date.now() + 3600_000) } });
    const attempt = await new GoogleConnectionService(db).begin("a", "s", { mode: "calendar" });
    expect(JSON.parse(attempt.requiredScopesJson)).toEqual(narrow.split(" "));
    const options = await authOptions({ attemptId: attempt.id, sessionToken: "s" });
    const params = (options.providers[0] as unknown as { options: { authorization: { params: Record<string, string> } } }).options.authorization.params;
    expect(params.scope).toBe(`openid email profile ${narrow}`);
    expect(params.include_granted_scopes).toBe("false");
  });
});

describe("choosing an app calendar by name", () => {
  it("normalises the name (trim, 1–100) and refuses a same-named calendar the app did not create, without POST", async () => {
    expect(normalizeCalendarName("  When2Watch   Series ")).toBe("When2Watch Series");
    expect(() => normalizeCalendarName("   ")).toThrow(); expect(() => normalizeCalendarName("x".repeat(101))).toThrow();
    const google = limitedGoogle({ existing: [{ id: "work", summary: "Werk" }, { id: "manual", summary: "when2watch" }] });
    const { settings } = await setup(google);
    const matches = await settings.nameMatches("a", "When2Watch");
    expect(matches).toEqual([{ id: "manual", summary: "when2watch", reusable: false }]);
    await expect(settings.create("a", { requestId: "req-00000001", name: "When2Watch", timeZone: "Europe/Amsterdam" })).rejects.toMatchObject({ code: "NAME_TAKEN" });
    expect(google.posts).toEqual([]);
  });

  it("creates the calendar once, binds it by ID as app-created, and keeps the binding after a rename", async () => {
    const google = limitedGoogle(), { db, settings } = await setup(google);
    const created = await settings.create("a", { requestId: "req-00000002", name: "When2Watch", timeZone: "Europe/Amsterdam" });
    expect(google.posts).toEqual(["When2Watch"]);
    const binding = await db.calendarBinding.findFirstOrThrow({ where: { userId: "a", status: "ACTIVE" } });
    expect(binding).toMatchObject({ calendarId: created.id, provenance: "APP_CREATED", accountId: "acc-a" });
    google.rename(created.id, "Mijn series");
    await settings.select("a", created.id);
    expect(await db.calendarBinding.findFirstOrThrow({ where: { userId: "a", status: "ACTIVE" } })).toMatchObject({ id: binding.id, summary: "Mijn series" });
    // A known app calendar with the same name is offered for reuse, not created again.
    expect(await settings.nameMatches("a", "mijn   SERIES")).toEqual([{ id: created.id, summary: "Mijn series", reusable: true }]);
  });

  it("never re-POSTs or name-matches after an uncertain create; recovery needs an explicit proven choice", async () => {
    const google = limitedGoogle({ losePost: true }), { db, settings } = await setup(google);
    await expect(settings.create("a", { requestId: "req-00000003", name: "When2Watch", timeZone: "Europe/Amsterdam" })).rejects.toMatchObject({ code: "CALENDAR_CREATION_UNCERTAIN" });
    await expect(settings.create("a", { requestId: "req-00000004", name: "When2Watch", timeZone: "Europe/Amsterdam" })).rejects.toMatchObject({ code: "CALENDAR_CREATION_PENDING" });
    expect(google.posts).toHaveLength(1);
    expect(await db.calendarBinding.count({ where: { userId: "a" } })).toBe(0);
    // Same name, but the lost POST proves nothing: not reusable.
    expect((await settings.nameMatches("a", "When2Watch"))[0]).toMatchObject({ reusable: false });
  });

  it("refuses to bind a calendar the app did not create", async () => {
    const google = limitedGoogle({ existing: [{ id: "manual", summary: "Series" }] }), { settings } = await setup(google);
    await expect(settings.select("a", "manual")).rejects.toMatchObject({ code: "NOT_APP_CALENDAR" });
  });
});

describe("legacy calendars under narrow grants", () => {
  it("pauses sync for an unproven legacy binding while stored data stays visible, and switches only after explicit acknowledgement", async () => {
    const google = limitedGoogle(), { db, calendar, settings } = await setup(google, { calendarId: "legacy@example.test" });
    await db.calendarBinding.updateMany({ data: { provenance: "LEGACY_UNVERIFIED" } });
    const service = new SyncService(db, calendar, { snapshot: async id => parseSnapshot(raw, id) }, { calendarId: "legacy@example.test", timeZone: "Europe/Amsterdam" }, () => new Date("2026-09-24T07:00:00Z"));
    const result = await service.add("a", 45039);
    expect(result).toMatchObject({ status: "success", calendarState: "paused" });
    expect((await overview("a", db, new Date("2026-09-24T07:00:00Z"))).shows[0].upcoming.length).toBeGreaterThan(0);
    const legacy = await db.calendarBinding.findFirstOrThrow({ where: { userId: "a", status: "ACTIVE" } });
    const created = await settings.create("a", { requestId: "req-00000005", name: "When2Watch", timeZone: "Europe/Amsterdam" });
    // Creating keeps the legacy binding active until the user explicitly switches.
    expect(await db.calendarBinding.findFirstOrThrow({ where: { userId: "a", status: "ACTIVE" } })).toMatchObject({ id: legacy.id });
    await expect(settings.switchCalendar("a", created.id, false)).rejects.toMatchObject({ code: "ACKNOWLEDGEMENT_REQUIRED" });
    await settings.switchCalendar("a", created.id, true);
    expect(await db.calendarBinding.findUniqueOrThrow({ where: { id: legacy.id } })).toMatchObject({ status: "INACTIVE" });
    expect(await db.calendarBinding.findFirstOrThrow({ where: { userId: "a", status: "ACTIVE" } })).toMatchObject({ calendarId: created.id, provenance: "APP_CREATED" });
  });

  it("pauses instead of widening scopes when the account only holds the old broad grant", async () => {
    const google = limitedGoogle(), { db, calendar } = await setup(google, { calendarId: "app@example.test", scope: "https://www.googleapis.com/auth/calendar.calendarlist.readonly https://www.googleapis.com/auth/calendar.events" });
    const service = new SyncService(db, calendar, { snapshot: async id => parseSnapshot(raw, id) }, { calendarId: "app@example.test", timeZone: "Europe/Amsterdam" });
    expect(await service.add("a", 45039)).toMatchObject({ calendarState: "paused" });
    const attempt = await db.googleConnectionAttempt.count();
    expect(attempt).toBe(0);
  });

  it("reports a 403 as a failure without requesting broader access", async () => {
    const google = limitedGoogle({ forbidden: true }), { db, calendar } = await setup(google, { calendarId: "app@example.test" });
    google.calendars.set("app@example.test", { id: "app@example.test", summary: "When2Watch", timeZone: "Europe/Amsterdam", accessRole: "owner", appCreated: true });
    const service = new SyncService(db, calendar, { snapshot: async id => parseSnapshot(raw, id) }, { calendarId: "app@example.test", timeZone: "Europe/Amsterdam" });
    const result = await service.add("a", 45039);
    expect(result.status).not.toBe("success");
    expect((await db.account.findUniqueOrThrow({ where: { id: "acc-a" } })).scope).toBe(narrow);
    expect(await db.googleConnectionAttempt.count()).toBe(0);
  });
});

describe("switching Google account", () => {
  it("keeps the internal user, refuses during a running sync and keeps the old binding as inactive history", async () => {
    const { db } = await setup(limitedGoogle(), { calendarId: "app@example.test" });
    await db.session.create({ data: { userId: "a", sessionToken: "s", expires: new Date(Date.now() + 3600_000) } });
    const connections = new GoogleConnectionService(db, () => async () => ({ access_token: "fresh", expiry_date: Date.now() + 3600_000 }), async () => Response.json({ items: [] }));
    const attempt = await connections.begin("a", "s", { mode: "candidate" });
    const account = { provider: "google", providerAccountId: "sub-a-second", type: "oauth" as const, scope: narrow, access_token: "x", refresh_token: "second-refresh" };
    await db.account.create({ data: { id: "acc-a2", userId: "a", type: "oauth", provider: "google", providerAccountId: "sub-a-second" } });
    await connections.complete(attempt.id, "s", "a", account, { email: "second@example.test", email_verified: true });
    let release!: () => void, entered!: () => void;
    const ready = new Promise<void>(r => entered = r), gate = new Promise<void>(r => release = r);
    const running = serializeCalendarMutation("a", async () => { entered(); await gate; }); await ready;
    await expect(connections.confirm("a", "s", attempt.id)).rejects.toMatchObject({ code: "SYNC_BUSY" });
    release(); await running;
    await connections.confirm("a", "s", attempt.id);
    expect(await db.userConnection.findUniqueOrThrow({ where: { userId: "a" } })).toMatchObject({ accountId: "acc-a2" });
    expect(await db.calendarBinding.findMany({ where: { userId: "a" }, select: { calendarId: true, status: true } })).toEqual([{ calendarId: "app@example.test", status: "INACTIVE" }]);
  });
});
