import { afterEach, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
// @ts-expect-error plain ESM operator script without types
import { r2Problems } from "../scripts/ready-r2.mjs";
import { encryptCredentials } from "../scripts/migration/encrypt-credentials";
import { testDatabase } from "./database";

let storage: ReturnType<typeof testDatabase>, dir: string;
afterEach(async () => { await storage?.close(); rmSync(dir, { recursive: true, force: true }); });

it("refuses to serve until backfill, sealing and the installation's journal are in place", async () => {
  storage = testDatabase(); const db = storage.db; dir = mkdtempSync(join(tmpdir(), "w2w-ready-"));
  const journal = join(dir, "deletions.jsonl"), env = { W2W_CREDENTIAL_KEYS: process.env.W2W_CREDENTIAL_KEYS, W2W_DELETION_JOURNAL: journal };
  await db.user.create({ data: { id: "owner" } });
  await db.trackedShow.create({ data: { userId: "owner", tvmazeId: 1, title: "x", sourceUrl: "x", status: "x" } });
  await db.oAuthClientConfig.create({ data: { id: "client", clientId: "c", clientSecret: "plain-secret" } });
  await db.installation.create({ data: { id: "singleton", ownerId: "owner", oauthClientConfigId: "client" } });
  const problems = await r2Problems(db, env);
  expect(problems.join("\n")).toMatch(/backfill[\s\S]*not sealed[\s\S]*journal/);
  expect(problems.join()).not.toContain("plain-secret");
  expect(await r2Problems(db, {})).toContain("W2W_CREDENTIAL_KEYS is missing");

  await db.migrationRun.create({ data: { id: "run", phase: "catalog-backfill", sourceChecksum: "x", schemaVersion: "x", completedAt: new Date() } });
  await encryptCredentials(db);
  await db.installation.update({ where: { id: "singleton" }, data: { deletionJournalId: "j1" } });
  writeFileSync(journal, `${JSON.stringify({ kind: "header", format: "w2w-deletion-journal-1", journalId: "other" })}\n`);
  expect(await r2Problems(db, env)).toEqual([expect.stringMatching(/journal/)]);
  writeFileSync(journal, `${JSON.stringify({ kind: "header", format: "w2w-deletion-journal-1", journalId: "j1" })}\n`);
  expect(await r2Problems(db, env)).toEqual([]);
});
