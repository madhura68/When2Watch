import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { legacySqliteDatabase, testDatabase } from "../database";
import { applicationModels, archivedMigrations, type Manifest } from "../../scripts/migration/manifest";
import { exportSqlite } from "../../scripts/migration/sqlite-export";
import { importEmptyTarget, validateSource } from "../../scripts/migration/import-postgres";
import { verifyEquivalent } from "../../scripts/migration/verify-import";
import { getInstallation, importLegacyInstallation } from "@/server/installation";

const populated = readFileSync("tests/fixtures/migration/populated.sql", "utf8");
const runId = "5d0b1c7e-3c1a-4c8e-9d52-0b1f3a2e4c11";
let cleanup: (() => Promise<void> | void)[] = [];
afterEach(async () => { for (const step of cleanup.reverse()) await step(); cleanup = []; });

function source(extraSql = "", beforeMigration?: string) {
  const legacy = legacySqliteDatabase(beforeMigration);
  legacy.sqlite.exec("PRAGMA foreign_keys = OFF");
  // Same bookkeeping table `prisma migrate deploy` keeps in the real source.
  legacy.sqlite.exec(`CREATE TABLE "_prisma_migrations" ("id" TEXT PRIMARY KEY NOT NULL, "checksum" TEXT NOT NULL, "finished_at" DATETIME, "migration_name" TEXT NOT NULL, "logs" TEXT, "rolled_back_at" DATETIME, "started_at" DATETIME NOT NULL DEFAULT current_timestamp, "applied_steps_count" INTEGER UNSIGNED NOT NULL DEFAULT 0)`);
  const insert = legacy.sqlite.prepare(`INSERT INTO "_prisma_migrations"(id,checksum,finished_at,migration_name,applied_steps_count) VALUES (?,?,?,?,1)`);
  for (const [index, migration] of archivedMigrations().filter(item => !beforeMigration || item.name < beforeMigration).entries()) insert.run(`m${index}`, migration.checksum, Date.now(), migration.name);
  legacy.sqlite.exec(populated + extraSql);
  legacy.sqlite.close();
  cleanup.push(() => legacy.close());
  return legacy.path;
}
function target() { const storage = testDatabase(); cleanup.push(() => storage.close()); return storage.db; }
const clone = (manifest: Manifest) => structuredClone(manifest);

describe("SQLite export", () => {
  it("exports all 15 models with typed, exact values and no migration bookkeeping", () => {
    const manifest = exportSqlite(source(), { runId });
    expect(Object.keys(manifest.tables).sort()).toEqual([...applicationModels].sort());
    expect(manifest.tables).not.toHaveProperty("_prisma_migrations");
    expect(manifest.tables.User.count).toBe(2);
    const show = manifest.tables.TrackedShow.rows.find(row => row.id === "show")!;
    // Prisma integer milliseconds around the 2026-10-25 DST change stay exact.
    expect(show).toMatchObject({ trying: true, lastAttemptAt: { $date: "2026-10-25T00:59:59.999Z" }, lastSuccessAt: { $date: "2026-10-25T01:00:00.000Z" }, country: "" });
    // CURRENT_TIMESTAMP text is UTC by SQLite definition.
    expect(manifest.tables.SyncRun.rows.find(row => row.id === "run")).toMatchObject({ startedAt: { $date: "2026-10-25T00:59:59.000Z" } });
    expect(manifest.tables.GoogleConnectionAttempt.rows[0]).toMatchObject({ createdAt: { $date: "2026-09-24T12:10:00.123Z" } });
    expect(manifest.tables.Episode.rows.find(row => row.id === "episode-3")).toMatchObject({ present: true, season: 1, title: "Ünïcode 🎞" });
    expect(manifest.tables.Probe.rows[0]).toMatchObject({ requestJson: '{ "b": 1, "a": [ ] }', date: "2026-09-24" });
    expect(manifest.tables.User.rows.find(row => row.id === "other")).toMatchObject({ name: "", email: null, image: "" });
  });

  it.each([
    ["an unknown DateTime storage", `UPDATE "Session" SET expires = 'tomorrow';`, /Session\.expires/],
    ["a REAL DateTime", `UPDATE "Probe" SET createdAt = 1.5;`, /Probe\.createdAt/],
    ["a non-boolean value", `UPDATE "Episode" SET present = 2 WHERE id = 'episode';`, /Episode\.present/],
    ["text in an Int column", `UPDATE "TrackedShow" SET runtimeMinutes = 'fifty' WHERE id = 'show';`, /TrackedShow\.runtimeMinutes/],
    ["a missing foreign key", `INSERT INTO "Episode"(id,trackedShowId,sourceId,sourceUrl) VALUES ('orphan','missing-show',1,'x');`, /foreign key/i],
  ])("refuses %s instead of coercing or repairing", (_name, sql, error) => {
    expect(() => exportSqlite(source(sql), { runId })).toThrow(error);
  });

  it("refuses a source whose schema differs from the archived release", () => {
    expect(() => exportSqlite(source(`ALTER TABLE "TrackedShow" ADD COLUMN "unexpected" TEXT;`), { runId })).toThrow(/schema/i);
  });
});

describe("PostgreSQL import", () => {
  it("imports into an empty target and verifies every field and relation", async () => {
    const manifest = exportSqlite(source(), { runId }), db = target();
    expect(await importEmptyTarget(db, manifest)).toMatchObject({ status: "imported" });
    const report = await verifyEquivalent(db, manifest);
    expect(report.passed).toBe(true);
    expect(report.tableCounts).toMatchObject({ User: 2, Episode: 3, CalendarEventLink: 2, SyncRun: 2 });
    expect(Object.values(report.differenceCounts).every(count => count === 0)).toBe(true);
    // Spot checks through the normal application client.
    expect(await db.session.findUniqueOrThrow({ where: { id: "session" } })).toMatchObject({ expires: new Date(1792576799999) });
    expect(await db.calendarEventLink.findUniqueOrThrow({ where: { id: "link-pending" } })).toMatchObject({ status: "sending", confirmedDesiredHash: null });
    expect(await db.account.findUniqueOrThrow({ where: { id: "account" } })).toMatchObject({ refresh_token: "synthetic-refresh", needsReauth: false });
    // Startup must see the imported owner, not an empty claimable installation.
    const installation = await getInstallation(db);
    expect(installation).toMatchObject({ ownerId: "owner", activeAccountId: "account", oauthClientConfigId: "client" });
    expect(await importLegacyInstallation(db, { allowedEmail: "intruder@example.test", clientId: "x", clientSecret: "y", calendarId: "z" })).toEqual(installation);
  });

  it("reports differences as counts only, never row payloads", async () => {
    const manifest = exportSqlite(source(), { runId }), db = target();
    await importEmptyTarget(db, manifest);
    await db.calendarEventLink.update({ where: { id: "link" }, data: { confirmedRemoteHash: "tampered-remote-hash" } });
    await db.account.update({ where: { id: "account" }, data: { refresh_token: "tampered-refresh" } });
    const report = await verifyEquivalent(db, manifest);
    expect(report).toMatchObject({ passed: false, differenceCounts: { CalendarEventLink: 1, Account: 1 } });
    expect(JSON.stringify(report)).not.toMatch(/tampered|synthetic-refresh|remote-hash|owner@example/);
  });

  it("rolls back everything when a row fails halfway", async () => {
    const manifest = clone(exportSqlite(source(), { runId })), db = target();
    manifest.tables.CalendarEventLink.rows[1].eventId = manifest.tables.CalendarEventLink.rows[0].eventId;
    await expect(importEmptyTarget(db, manifest)).rejects.toThrow();
    for (const model of ["user", "episode", "calendarEventLink", "legacyImportRun"] as const) expect(await (db[model] as { count(): Promise<number> }).count()).toBe(0);
  });

  it("refuses duplicate primary keys and tampered counts before writing", async () => {
    const manifest = clone(exportSqlite(source(), { runId }));
    manifest.tables.User.rows.push({ ...manifest.tables.User.rows[0] }); manifest.tables.User.count++;
    expect(() => validateSource(manifest)).toThrow(/duplicate/i);
    const counted = clone(exportSqlite(source(), { runId })); counted.tables.Episode.count = 99;
    expect(() => validateSource(counted)).toThrow(/count/i);
    const unknown = clone(counted); unknown.tables.Episode.count = 3; unknown.schemaSignature = "0".repeat(64);
    expect(() => validateSource(unknown)).toThrow(/schema/i);
  });

  it("only verifies a repeated identical run and refuses a different manifest or a non-empty target", async () => {
    const manifest = exportSqlite(source(), { runId }), db = target();
    await importEmptyTarget(db, manifest);
    expect(await importEmptyTarget(db, manifest)).toMatchObject({ status: "already-imported" });
    expect(await db.user.count()).toBe(2);
    await expect(importEmptyTarget(db, exportSqlite(source(), { runId: "0e4b9c2a-1111-4c8e-9d52-0b1f3a2e4c11" }))).rejects.toThrow(/different run/i);
    const other = target();
    await other.user.create({ data: { id: "created-by-app" } });
    await expect(importEmptyTarget(other, manifest)).rejects.toThrow(/not empty/i);
    expect(await other.legacyImportRun.count()).toBe(0);
  });
});
