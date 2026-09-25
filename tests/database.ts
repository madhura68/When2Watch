import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtempSync, rmSync, readdirSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";

// Test databases live only on a disposable local PostgreSQL server. Production
// runs on the compose-internal host "db", which is deliberately not allowed.
const localHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]", "postgres"]);
export const templateDatabase = "w2w_test_template";

export function testServerUrl(raw = process.env.W2W_TEST_DATABASE_URL): URL {
  if (!raw) throw Error("Set W2W_TEST_DATABASE_URL to a disposable local PostgreSQL 17 server (see README, Tests).");
  const url = new URL(raw);
  if (!/^postgres(ql)?:$/.test(url.protocol) || !localHosts.has(url.hostname)) throw Error("Refusing a non-local test database server.");
  if (process.env.DATABASE_URL && process.env.DATABASE_URL === raw) throw Error("Refusing to use DATABASE_URL as the test server.");
  return url;
}

export function databaseUrl(name: string, server = testServerUrl()): string {
  if (!/^w2w_test_[a-z0-9_]+$/.test(name)) throw Error("Test databases must be named w2w_test_*.");
  const url = new URL(server); url.pathname = `/${name}`;
  return url.toString();
}

/** Runs SQL through the Prisma 6 CLI; the DSN travels via the environment, never argv. */
export function execSql(sql: string, url = testServerUrl().toString()) {
  execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "db", "execute", "--stdin", "--schema", "prisma/schema.prisma"], {
    input: sql, env: { ...process.env, DATABASE_URL: url }, stdio: ["pipe", "pipe", "pipe"],
  });
}

export function migrateDeploy(url: string) {
  execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], {
    env: { ...process.env, DATABASE_URL: url, RUST_LOG: "info" }, stdio: "pipe",
  });
}

/** Empty, fully migrated PostgreSQL database cloned from the template built in global setup. */
export function testDatabase() {
  const name = `w2w_test_${randomBytes(6).toString("hex")}`, url = databaseUrl(name);
  execSql(`CREATE DATABASE "${name}" TEMPLATE "${templateDatabase}"`);
  const db = new PrismaClient({ datasourceUrl: url });
  return {
    db, url,
    reopen: () => new PrismaClient({ datasourceUrl: url }),
    async close() {
      await db.$disconnect();
      execSql(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
    },
  };
}

/** Archived SQLite schema history (release 53a8a2f) for legacy-migration and export tests only. */
export function legacySqliteDatabase(beforeMigration?: string) {
  const dir = mkdtempSync(join(tmpdir(), "when2watch-legacy-")), path = join(dir, "legacy.db");
  const root = "prisma/legacy-sqlite/migrations";
  const names = readdirSync(root).filter(name => /^\d/.test(name)).sort();
  const sqlite = new DatabaseSync(path);
  const applyMigration = (name: string) => sqlite.exec(readFileSync(join(root, name, "migration.sql"), "utf8"));
  for (const name of names.filter(name => !beforeMigration || name < beforeMigration)) applyMigration(name);
  return {
    sqlite, path, applyMigration,
    all: (sql: string) => sqlite.prepare(sql).all() as Record<string, unknown>[],
    close() { if (sqlite.isOpen) sqlite.close(); rmSync(dir, { recursive: true, force: true }); },
  };
}
