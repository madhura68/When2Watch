/**
 * Timed R1 rehearsal/cutover pipeline on a frozen SQLite copy: export → import → verify.
 * Egress and scheduler must be off; the report holds counts and durations only.
 *   W2W_MIGRATION_CONFIG=/abs/private/config.json npx tsx scripts/migration/rehearse.ts --phase=migrate|verify
 * `migrate` writes the private manifest and imports into the empty target;
 * `verify` re-checks the target (e.g. after app start or on a restored dump) against that manifest.
 */
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { PrismaClient } from "@prisma/client";
import { readConfig, safeError, writePrivateJson, type Manifest } from "./manifest";
import { exportSqlite } from "./sqlite-export";
import { importEmptyTarget } from "./import-postgres";
import { verifyEquivalent } from "./verify-import";

async function timed<T>(phases: Record<string, number>, name: string, run: () => Promise<T> | T): Promise<T> {
  const started = performance.now();
  try { return await run(); } finally { phases[name] = Math.round(performance.now() - started); }
}

async function main() {
  const phase = process.argv.find(arg => arg.startsWith("--phase="))?.slice(8);
  if (phase !== "migrate" && phase !== "verify") throw Error("Use --phase=migrate or --phase=verify.");
  const config = readConfig(), phasesMs: Record<string, number> = {};
  // W2W_VERIFY_DATABASE_URL (e.g. a restored dump) is honoured only when verifying, never for an import.
  const db = new PrismaClient({ datasourceUrl: phase === "verify" ? process.env.W2W_VERIFY_DATABASE_URL ?? config.targetDatabaseUrl : config.targetDatabaseUrl });
  try {
    let manifest: Manifest, imported: unknown;
    if (phase === "migrate") {
      manifest = await timed(phasesMs, "export", () => exportSqlite(config.sourceSqlite, { runId: config.runId }));
      writePrivateJson(config.manifest, manifest);
      imported = await timed(phasesMs, "import", () => importEmptyTarget(db, manifest));
    } else manifest = JSON.parse(readFileSync(config.manifest, "utf8")) as Manifest;
    const report = await timed(phasesMs, "verify", () => verifyEquivalent(db, manifest));
    console.log(JSON.stringify({ phase, runId: manifest.runId, sourceSha256: manifest.sourceSha256, imported, phasesMs, report }));
    if (!report.passed) process.exitCode = 1;
  } finally { await db.$disconnect(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(error => { console.error(safeError(error)); process.exitCode = 1; });
