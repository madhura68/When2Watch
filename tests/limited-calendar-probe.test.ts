import { describe, expect, it } from "vitest";
import {
  assertProbeCalendar, grantStatus, limitedScopes, parseProbeConfig, probeOutcome, paginationProven, reconcileLostCalendarCreate, resumeSentCreate, sanitizeShape,
} from "../scripts/prove-limited-calendar";

const config = {
  accounts: ["proef@example.test"], credentials: "/private/probe-client.json", calendarPrefix: "When2Watch proef",
  probeClientIsNotProduction: true, existingCalendarId: "legacy@group.calendar.google.com",
};

describe("probe configuration", () => {
  it("requires an explicit account allowlist, separate probe client and recognisable calendar prefix", () => {
    expect(parseProbeConfig(config)).toMatchObject({ accounts: ["proef@example.test"], calendarPrefix: "When2Watch proef" });
    expect(() => parseProbeConfig({ ...config, accounts: [] })).toThrow(/account/);
    expect(() => parseProbeConfig({ ...config, accounts: ["no-at-sign"] })).toThrow(/account/);
    expect(() => parseProbeConfig({ ...config, credentials: "relative.json" })).toThrow(/absolute/);
    expect(() => parseProbeConfig({ ...config, probeClientIsNotProduction: false })).toThrow(/production/);
    expect(() => parseProbeConfig({ ...config, calendarPrefix: "ab" })).toThrow(/prefix/);
  });
});

describe("scopes", () => {
  it("requests only identity plus calendarlist.readonly and app.created", () => {
    expect(limitedScopes).toEqual([
      "openid", "email", "profile",
      "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
      "https://www.googleapis.com/auth/calendar.app.created",
    ]);
    expect(limitedScopes.some(scope => /calendar\.events|auth\/calendar$/.test(scope))).toBe(false);
  });

  it("judges narrowness on the effectively granted scopes, not on the requested text", () => {
    const narrow = "openid https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/calendar.calendarlist.readonly https://www.googleapis.com/auth/calendar.app.created";
    expect(grantStatus(narrow)).toEqual({ narrow: true, missing: [], broader: [] });
    const withLegacy = `${narrow} https://www.googleapis.com/auth/calendar.events`;
    expect(grantStatus(withLegacy)).toEqual({ narrow: false, missing: [], broader: ["https://www.googleapis.com/auth/calendar.events"] });
    expect(grantStatus("openid https://www.googleapis.com/auth/calendar.app.created")).toMatchObject({
      narrow: false, missing: ["https://www.googleapis.com/auth/calendar.calendarlist.readonly"],
    });
  });
});

describe("mutation boundary", () => {
  const state = { calendars: [{ id: "created-1", name: "When2Watch proef 1", phase: "ready" as const }] };
  it("only mutates calendars this probe created and recorded", () => {
    expect(() => assertProbeCalendar(state, "created-1", "When2Watch proef")).not.toThrow();
    expect(() => assertProbeCalendar(state, "legacy@group.calendar.google.com", "When2Watch proef")).toThrow(/not created by this probe/);
    expect(() => assertProbeCalendar({ calendars: [{ id: "x", name: "Privé", phase: "ready" }] }, "x", "When2Watch proef")).toThrow(/prefix/);
  });
});

describe("lost create response", () => {
  const pending = { name: "When2Watch proef onzeker", nonce: "n-123" };
  it("adopts exactly one new calendar carrying the nonce without a second POST", () => {
    const before = ["a"];
    const after = [{ id: "a", summary: "Werk" }, { id: "b", summary: pending.name, description: "nonce n-123" }];
    expect(reconcileLostCalendarCreate(pending, before, after)).toEqual({ status: "adopted", id: "b" });
  });
  it("never matches on name alone and stays uncertain when nothing provable appears", () => {
    const after = [{ id: "a", summary: "Werk" }, { id: "c", summary: pending.name, description: "handmatig" }];
    expect(reconcileLostCalendarCreate(pending, ["a"], after)).toEqual({ status: "uncertain" });
    expect(reconcileLostCalendarCreate(pending, ["a", "b"], [{ id: "b", summary: pending.name, description: "nonce n-123" }])).toEqual({ status: "uncertain" });
  });
  it("refuses to choose between two nonce-bearing candidates", () => {
    const after = [{ id: "b", summary: pending.name, description: "nonce n-123" }, { id: "d", summary: pending.name, description: "nonce n-123" }];
    expect(reconcileLostCalendarCreate(pending, [], after)).toEqual({ status: "ambiguous", ids: ["b", "d"] });
  });
});

describe("evidence", () => {
  it("keeps response shapes but strips identifiers, tokens and personal values", () => {
    const raw = { kind: "calendar#calendarListEntry", id: "secret@group.calendar.google.com", etag: "\"123\"", summary: "Mijn agenda",
      accessRole: "owner", access_token: "ya29.x", items: [{ id: "e1", status: "confirmed", start: { date: "2026-09-25" } }], nextPageToken: "tok" };
    const shape = sanitizeShape(raw);
    expect(JSON.stringify(shape)).not.toMatch(/secret@|ya29|Mijn agenda|"e1"|tok"/);
    expect(shape).toMatchObject({ kind: "calendar#calendarListEntry", accessRole: "owner", id: "<string>", access_token: "<redacted>",
      items: [{ status: "confirmed", start: { date: "2026-09-25" } }] });
  });

  it("derives PASSED only from executed real steps and names the cause otherwise", () => {
    const all = ["authorize", "grant-narrow", "list-paginated", "calendar-created", "event-crud", "calendar-renamed", "token-refresh", "lost-create-reconciled", "legacy-readonly-checked"];
    expect(probeOutcome(all.map(step => ({ step, ok: true })))).toEqual({ status: "PASSED" });
    expect(probeOutcome([])).toEqual({ status: "BLOCKED", cause: "not executed: authorize" });
    expect(probeOutcome([...all.map(step => ({ step, ok: true })), { step: "event-crud", ok: false, cause: "403 CALENDAR_FORBIDDEN" }]))
      .toEqual({ status: "FAILED", cause: "event-crud: 403 CALENDAR_FORBIDDEN" });
    expect(probeOutcome(all.slice(0, 3).map(step => ({ step, ok: true })))).toEqual({ status: "BLOCKED", cause: "not executed: calendar-created" });
  });

  it("judges each step on its latest attempt, so a retried step can still pass", () => {
    const all = ["authorize", "grant-narrow", "list-paginated", "calendar-created", "event-crud", "calendar-renamed", "token-refresh", "lost-create-reconciled", "legacy-readonly-checked"];
    expect(probeOutcome([{ step: "authorize", ok: false, cause: "state mismatch" }, ...all.map(step => ({ step, ok: true }))])).toEqual({ status: "PASSED" });
    expect(probeOutcome([...all.map(step => ({ step, ok: true })), { step: "token-refresh", ok: false, cause: "invalid_grant" }])).toEqual({ status: "FAILED", cause: "token-refresh: invalid_grant" });
  });
});

describe("resume after a sent create", () => {
  const entry = { name: "When2Watch proef onzeker", nonce: "n-1", phase: "sending" as const, beforeIds: ["a"] };
  it("never re-sends: adopts the provable calendar or stays uncertain", () => {
    expect(resumeSentCreate(entry, [{ id: "a" }, { id: "b", summary: entry.name, description: "nonce n-1" }])).toEqual({ status: "adopted", id: "b" });
    expect(resumeSentCreate(entry, [{ id: "a" }])).toEqual({ status: "uncertain" });
    expect(() => resumeSentCreate({ ...entry, beforeIds: undefined }, [])).toThrow(/snapshot/);
  });
});

describe("pagination evidence", () => {
  it("does not count a single-calendar, single-page list as proven pagination", () => {
    expect(paginationProven(1, 1)).toBe(false);
    expect(paginationProven(1, 3)).toBe(false);
    expect(paginationProven(3, 3)).toBe(true);
  });
});
