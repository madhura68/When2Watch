import { afterEach, expect, it } from "vitest";
import { runRetention } from "@/server/retention";
import { runDaily } from "@/server/cron";
import { testDatabase } from "./database";
import { activeUser, installation } from "./fixtures/users";

let storage: ReturnType<typeof testDatabase>;
afterEach(async () => { await storage?.close(); });
const now = new Date("2026-09-25T06:05:00Z"), daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000);

it("prunes each kind at its own period and keeps recovery intentions, app-ownership proof and running work", async () => {
  storage = testDatabase(); const db = storage.db;
  await activeUser(db, "a", { role: "ADMIN" }); await installation(db, "a");
  await db.syncRun.createMany({ data: [{ userId: "a", trigger: "cron", status: "success", startedAt: daysAgo(31) }, { userId: "a", trigger: "cron", status: "success", startedAt: daysAgo(29) },
    { userId: "a", trigger: "cron", status: "running", startedAt: daysAgo(40) }] });
  await db.auditEvent.createMany({ data: [{ action: "x", at: daysAgo(91) }, { action: "y", at: daysAgo(89) }] });
  await db.invitation.createMany({ data: [
    { email: "old-accepted@example.test", tokenHash: "h1", expiresAt: daysAgo(5), acceptedAt: daysAgo(8), invitedById: "a" },
    { email: "old-expired@example.test", tokenHash: "h2", expiresAt: daysAgo(8), invitedById: "a" },
    { email: "recent-revoked@example.test", tokenHash: "h3", expiresAt: daysAgo(1), revokedAt: daysAgo(6), invitedById: "a" },
    { email: "open@example.test", tokenHash: "h4", expiresAt: daysAgo(-2), invitedById: "a" }] });
  await db.searchCache.createMany({ data: [{ key: "expired", resultJson: "[]", expiresAt: daysAgo(0.01) }, { key: "fresh", resultJson: "[]", expiresAt: daysAgo(-0.01) }] });
  await db.googleConnectionAttempt.createMany({ data: [
    { id: "expired-with-tokens", ownerId: "a", sessionHash: "s", mode: "calendar", oauthClientConfigId: "client", status: "completed", expiresAt: daysAgo(0.1), tokensJson: "w2w:v1:x" },
    { id: "old", ownerId: "a", sessionHash: "s", mode: "calendar", oauthClientConfigId: "client", status: "cancelled", expiresAt: daysAgo(8) }] });
  await db.calendarCreationAttempt.createMany({ data: ["uncertain", "sending", "selected", "ready", "abandoned", "rejected"].map(status =>
    ({ id: `c-${status}`, ownerId: "a", accountId: "acc-a", name: status, timeZone: "Europe/Amsterdam", status, createdAt: daysAgo(60) })) });
  await db.session.createMany({ data: [{ userId: "a", sessionToken: "gone", expires: daysAgo(1) }, { userId: "a", sessionToken: "live", expires: daysAgo(-1) }] });
  await db.deletionTombstone.createMany({ data: [{ userId: "deleted-long-ago", deletedAt: daysAgo(32) }, { userId: "deleted-recently", deletedAt: daysAgo(20) }] });

  expect(await runRetention(db, now)).toEqual({ pendingDeletions: 0, searchCache: 1, syncRuns: 1, audit: 1, invitations: 2, invitationFlows: 0, attemptTokens: 1, attempts: 1,
    failedCreations: 2, sessions: 1, tombstones: 1 });
  expect((await db.syncRun.findMany({ select: { status: true } })).map(r => r.status).sort()).toEqual(["running", "success"]);
  expect((await db.invitation.findMany({ select: { tokenHash: true } })).map(r => r.tokenHash).sort()).toEqual(["h3", "h4"]);
  expect((await db.calendarCreationAttempt.findMany({ select: { status: true } })).map(r => r.status).sort()).toEqual(["ready", "selected", "sending", "uncertain"]);
  expect(await db.googleConnectionAttempt.findUniqueOrThrow({ where: { id: "expired-with-tokens" } })).toMatchObject({ tokensJson: null });
  expect(await db.searchCache.findMany({ select: { key: true } })).toEqual([{ key: "fresh" }]);
  expect(await runRetention(db, now)).toMatchObject({ syncRuns: 0, audit: 0, invitations: 0, sessions: 0 });
});

it("runs daily after the sync; a retention failure makes the run partial without hiding the sync result", async () => {
  storage = testDatabase(); const db = storage.db;
  const source = { snapshot: async () => { throw Error("unused"); }, updates: async () => new Map<number, number>(), artwork: async () => ({ bannerUrl: null, backgroundUrl: null }) };
  await db.auditEvent.create({ data: { action: "old", at: daysAgo(100) } });
  const report = await runDaily(db, source, () => { throw Error("no users"); }, now);
  expect(report).toMatchObject({ status: "success", users: 0, retention: { audit: 1 } });
  const broken = new Proxy(db, { get: (target, key) => key === "auditEvent" ? { deleteMany: async () => { throw Error("db down"); } } : Reflect.get(target, key) });
  expect(await runDaily(broken, source, () => { throw Error("no users"); }, now)).toMatchObject({ status: "partial", retention: "failed" });
});
