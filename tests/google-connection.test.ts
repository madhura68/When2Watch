import { afterEach, expect, it } from "vitest";
import { GoogleConnectionService } from "@/server/google-connection";
import { importLegacyInstallation } from "@/server/installation";
import { calendarScopes } from "@/server/auth-policy";
import { testDatabase } from "./database";

let storage: ReturnType<typeof testDatabase>;
afterEach(async () => { await storage?.close(); });
const session = "synthetic-owner-session", scope = ["openid", ...calendarScopes].join(" ");
async function fixture() {
  storage = testDatabase(); const db = storage.db;
  await db.user.create({ data: { id: "owner", email: "owner@example.test" } });
  await db.session.create({ data: { userId: "owner", sessionToken: session, expires: new Date(Date.now() + 3_600_000) } });
  await db.account.create({ data: { id: "account", userId: "owner", provider: "google", providerAccountId: "subject", type: "oauth", refresh_token: "old-refresh", access_token: "old-access", scope } });
  await importLegacyInstallation(db, { allowedEmail: "owner@example.test", clientId: "old-client", clientSecret: "old-secret" });
  const refreshes: string[] = [];
  const service = new GoogleConnectionService(db, (clientId, secret) => async token => {
    refreshes.push(`${clientId}:${secret}:${token}`);
    return { access_token: "verified-access", expiry_date: Date.now() + 3_600_000 };
  }, async () => Response.json({ items: [] }));
  return { db, service, refreshes };
}
const callback = (refresh_token?: string) => ({ provider: "google", providerAccountId: "subject", type: "oauth" as const, scope, access_token: "candidate-access", refresh_token, expires_at: Math.floor(Date.now() / 1000) + 3600 });
const profile = { email: "owner@example.test", email_verified: true, name: "Owner" };

it("binds callbacks to an unexpired initiating owner session and consumes them once", async () => {
  const { db, service } = await fixture();
  const attempt = await service.begin("owner", session, { mode: "calendar" });
  await expect(service.validate(attempt.id, "other-session")).rejects.toMatchObject({ code: "CONNECTION_EXPIRED" });
  expect((await service.validate(attempt.id, session)).ownerId).toBe("owner");
  expect(await service.accepts(attempt.id, session, callback("new-refresh"), { ...profile, email_verified: false })).toBe(false);
  expect(await service.accepts(attempt.id, session, { ...callback(), providerAccountId: "stranger" }, profile)).toBe(false);
  await service.complete(attempt.id, session, "owner", callback("new-refresh"), profile);
  await expect(service.complete(attempt.id, session, "owner", callback("new-refresh"), profile)).rejects.toMatchObject({ code: "CONNECTION_EXPIRED" });
  expect((await db.account.findUniqueOrThrow({ where: { id: "account" } })).access_token).toBe("old-access");
  await db.googleConnectionAttempt.update({ where: { id: attempt.id }, data: { expiresAt: new Date(0) } });
  await expect(service.confirm("owner", session, attempt.id)).rejects.toMatchObject({ code: "CONNECTION_EXPIRED" });
});

it("never borrows an old-client refresh token and activates a replacement only after its own live access check", async () => {
  const { db, service, refreshes } = await fixture();
  const old = await db.installation.findUniqueOrThrow({ where: { id: "singleton" } });
  const attempt = await service.begin("owner", session, { mode: "replace-client", clientId: "new-client.apps.googleusercontent.com", clientSecret: "new-secret" });
  await service.complete(attempt.id, session, "owner", callback(), profile);
  await expect(service.confirm("owner", session, attempt.id)).rejects.toMatchObject({ code: "RECONNECT_GOOGLE" });
  expect(await db.installation.findUnique({ where: { id: "singleton" } })).toEqual(old);
  expect(refreshes).toEqual([]);
  const fresh = await service.begin("owner", session, { mode: "replace-client", clientId: "new-client.apps.googleusercontent.com", clientSecret: "new-secret" });
  await service.complete(fresh.id, session, "owner", callback("new-refresh"), profile);
  await service.confirm("owner", session, fresh.id);
  expect(refreshes).toEqual(["new-client.apps.googleusercontent.com:new-secret:new-refresh"]);
  const active = await db.installation.findUniqueOrThrow({ where: { id: "singleton" } });
  expect(active.ownerId).toBe("owner"); expect(active.activeAccountId).toBe("account");
  expect(active.oauthClientConfigId).not.toBe(old.oauthClientConfigId);
  expect((await db.account.findUniqueOrThrow({ where: { id: "account" } })).oauthClientConfigId).toBe(active.oauthClientConfigId);
});

it("keeps the active tokens when permission is cancelled or a successful callback grants insufficient scopes", async () => {
  const { db, service } = await fixture();
  const attempt = await service.begin("owner", session, { mode: "calendar" });
  await service.cancel(attempt.id, session);
  await expect(service.validate(attempt.id, session)).rejects.toMatchObject({ code: "CONNECTION_EXPIRED" });
  const partial = await service.begin("owner", session, { mode: "calendar" });
  const account = { ...callback("partial-refresh"), scope: "openid" };
  expect(await service.accepts(partial.id, session, account, profile)).toBe(true);
  await service.complete(partial.id, session, "owner", account, profile);
  await expect(service.confirm("owner", session, partial.id)).rejects.toMatchObject({ code: "CALENDAR_PERMISSION_REQUIRED" });
  expect((await db.account.findUniqueOrThrow({ where: { id: "account" } })).refresh_token).toBe("old-refresh");
});
