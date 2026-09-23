import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";

export function testDatabase() {
  const dir = mkdtempSync(join(tmpdir(), "when2watch-test-"));
  const url = `file:${join(dir, "test.db")}`;
  execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], {
    // The Mac exports RUST_LOG=warn; Prisma's SQLite existence check parses
    // an info-level engine response. Keep the CLI's normal logging level.
    env: { ...process.env, DATABASE_URL: url, RUST_LOG: "info" },
    stdio: "pipe",
  });
  const db = new PrismaClient({ datasourceUrl: url });
  return {
    db,
    reopen: () => new PrismaClient({ datasourceUrl: url }),
    async close() {
      await db.$disconnect();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
