import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, readdirSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";

export function testDatabase(beforeMigration?: string) {
  const dir = mkdtempSync(join(tmpdir(), "when2watch-test-"));
  const url = `file:${join(dir, "test.db")}`;
  const applyMigration = (name: string) => {
    const sqlite = new DatabaseSync(join(dir, "test.db"));
    try { sqlite.exec(readFileSync(join("prisma/migrations", name, "migration.sql"), "utf8")); }
    finally { sqlite.close(); }
  };
  if (beforeMigration) {
    for (const name of readdirSync("prisma/migrations").filter(name => /^\d/.test(name) && name < beforeMigration).sort()) applyMigration(name);
  } else execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], {
    // The Mac exports RUST_LOG=warn; Prisma's SQLite existence check parses
    // an info-level engine response. Keep the CLI's normal logging level.
    env: { ...process.env, DATABASE_URL: url, RUST_LOG: "info" },
    stdio: "pipe",
  });
  const db = new PrismaClient({ datasourceUrl: url });
  return {
    db,
    applyMigration,
    reopen: () => new PrismaClient({ datasourceUrl: url }),
    async close() {
      await db.$disconnect();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
