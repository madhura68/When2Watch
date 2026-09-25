import { afterEach, expect, it } from "vitest";
import { importLegacyInstallation, ownerInstallation, publicInstallation } from "@/server/installation";
import { legacySqliteDatabase, testDatabase } from "./database";

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
  const old = legacySqliteDatabase(migration);
  try {
    old.sqlite.exec(`INSERT INTO User(id,email) VALUES ('owner','${legacy.allowedEmail}')`);
    old.sqlite.exec(`INSERT INTO Account (id,userId,type,provider,providerAccountId,refresh_token) VALUES ('account','owner','oauth','google','subject','preserved-token')`);
    old.sqlite.exec(`INSERT INTO Session(id,sessionToken,userId,expires) VALUES ('session','preserved-session','owner',${Date.now()+3600000})`);
    old.sqlite.exec(`INSERT INTO TrackedShow(id,userId,tvmazeId,title,status,sourceUrl) VALUES ('old-show','owner',45039,'Preserved','Running','https://example.test')`);
    old.sqlite.exec(`INSERT INTO Episode(id,trackedShowId,sourceId,sourceUrl,airdate) VALUES ('old-episode','old-show',1,'https://example.test/1','2026-09-30')`);
    old.sqlite.exec(`INSERT INTO CalendarEventLink(id,episodeId,calendarId,eventId,desiredJson,status) VALUES ('old-link','old-episode','old','preserved','{}','synced')`);
    const tables = ["User","Session","TrackedShow","Episode","CalendarEventLink"], read = () => tables.map(table => old.all(`SELECT * FROM "${table}" ORDER BY id`));
    const before = read(), columns = Object.keys(old.all(`SELECT * FROM Account`)[0]).map(c => `"${c}"`).join(",");
    const account = old.all(`SELECT ${columns} FROM Account`);
    old.applyMigration(migration);
    expect(read()).toEqual(before);
    expect(old.all(`SELECT ${columns} FROM Account`)).toEqual(account);
    expect(old.all(`SELECT count(*) AS n FROM Installation`)).toEqual([{n:0}]);
  } finally { old.close(); }
});
