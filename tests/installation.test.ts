import { afterEach, expect, it } from "vitest";
import { importLegacyInstallation, ownerInstallation, publicInstallation } from "@/server/installation";
import { testDatabase } from "./database";

const legacy = { allowedEmail: "owner@example.test", clientId: "old-client", clientSecret: "never-expose-secret", calendarId: "chosen@example.test" };
let storage: ReturnType<typeof testDatabase>;
afterEach(async () => { await storage?.close(); });
async function existingOwner() {
  storage = testDatabase(); const db = storage.db;
  await db.user.create({ data: { id: "owner", email: legacy.allowedEmail } });
  await db.account.create({ data: { id: "account", userId: "owner", type: "oauth", provider: "google", providerAccountId: "subject-owner", refresh_token: "never-expose-refresh" } });
  await db.trackedShow.create({ data: { userId: "owner", tvmazeId: 45039, title: "Saved series", status: "Running", sourceUrl: "https://example.test/show" } });
  return db;
}

it("imports the exact existing owner once and keeps stored identity and choices after restart/env changes", async () => {
  const db = await existingOwner();
  const result = await importLegacyInstallation(db, legacy);
  expect(result).toMatchObject({ ownerId: "owner", activeAccountId: "account", initialCalendarId: legacy.calendarId });
  const account = await db.account.findUniqueOrThrow({ where: { id: "account" } });
  expect(account.oauthClientConfigId).toBe(result!.oauthClientConfigId);
  expect(account.refresh_token).toBe("never-expose-refresh");
  const reopened = storage.reopen();
  try {
    expect(await importLegacyInstallation(reopened, { ...legacy, allowedEmail: "changed@example.test", clientId: "wrong-client", calendarId: "wrong-calendar" })).toEqual(result);
    expect(await reopened.oAuthClientConfig.count()).toBe(1);
    expect(await reopened.trackedShow.count({ where: { userId: "owner" } })).toBe(1);
  } finally { await reopened.$disconnect(); }
});

it("refuses ambiguous old account data atomically instead of taking the first Google account", async () => {
  const db = await existingOwner();
  await db.account.create({ data: { userId: "owner", provider: "google", providerAccountId: "second-subject", type: "oauth" } });
  await expect(importLegacyInstallation(db, legacy)).rejects.toMatchObject({ code: "INSTALLATION_AMBIGUOUS" });
  expect(await db.installation.count()).toBe(0);
  expect(await db.oAuthClientConfig.count()).toBe(0);
});

it("does not claim an empty database from an environment email", async () => {
  storage = testDatabase();
  expect(await importLegacyInstallation(storage.db, legacy)).toBeNull();
  expect(await storage.db.user.count()).toBe(0);
});

it("authorizes by internal owner and returns settings without secrets or tokens", async () => {
  const db = await existingOwner(); await importLegacyInstallation(db, legacy);
  await expect(ownerInstallation(db, "intruder")).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  await db.user.update({ where: { id: "owner" }, data: { email: "renamed@example.test" } });
  expect((await ownerInstallation(db, "owner")).activeAccountId).toBe("account");
  const response = await publicInstallation(db, "owner");
  expect(response).toMatchObject({ account: { email: "renamed@example.test" }, calendarReady: false, calendarPermission: false });
  expect(JSON.stringify(response)).not.toContain("never-expose");
  expect(JSON.stringify(response)).not.toContain("clientSecret");
});

it("adds installation tables without changing legacy owners, sessions, credentials or event mappings", async () => {
  const migration = "20260924122000_owner_configuration";
  storage = testDatabase(migration); const db = storage.db;
  await db.user.create({data:{id:"owner",email:legacy.allowedEmail}});
  await db.$executeRaw`INSERT INTO Account (id,userId,type,provider,providerAccountId,refresh_token) VALUES ('account','owner','oauth','google','subject','preserved-token')`;
  await db.session.create({data:{userId:"owner",sessionToken:"preserved-session",expires:new Date(Date.now()+3600000)}});
  const show = await db.trackedShow.create({data:{userId:"owner",tvmazeId:45039,title:"Preserved",status:"Running",sourceUrl:"https://example.test"}});
  const episode = await db.episode.create({data:{trackedShowId:show.id,sourceId:1,sourceUrl:"https://example.test/1",airdate:"2026-09-30"}});
  await db.calendarEventLink.create({data:{episodeId:episode.id,calendarId:"old",eventId:"preserved",desiredJson:"{}",status:"synced"}});
  const before = {users:await db.user.findMany(),sessions:await db.session.findMany(),shows:await db.trackedShow.findMany(),episodes:await db.episode.findMany(),links:await db.calendarEventLink.findMany()};
  storage.applyMigration(migration);
  expect({users:await db.user.findMany(),sessions:await db.session.findMany(),shows:await db.trackedShow.findMany(),episodes:await db.episode.findMany(),links:await db.calendarEventLink.findMany()}).toEqual(before);
  expect((await db.account.findUniqueOrThrow({where:{id:"account"}})).refresh_token).toBe("preserved-token");
  expect(await db.installation.count()).toBe(0);
});
