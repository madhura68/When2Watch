/**
 * Imports manifest v1 into an empty PostgreSQL target in one transaction, then verifies it.
 * Run: W2W_MIGRATION_CONFIG=/abs/private/config.json npx tsx scripts/migration/import-postgres.ts
 */
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { PrismaClient } from "@prisma/client";
import { applicationModels, manifestSha256, modelInfo, readConfig, safeError, toDatabase, validateSource, type Manifest } from "./manifest";
import { verifyEquivalent } from "./verify-import";

type Delegate = { count(): Promise<number>; createMany(args: { data: Record<string, unknown>[] }): Promise<{ count: number }> };

export { validateSource } from "./manifest";

export async function importEmptyTarget(db: PrismaClient, manifest: Manifest) {
  validateSource(manifest);
  const digest = manifestSha256(manifest);
  const status = await db.$transaction(async tx => {
    const previous = await tx.legacyImportRun.findUnique({ where: { id: "legacy-sqlite" } });
    if (previous) {
      if (previous.runId === manifest.runId && previous.manifestSha256 === digest) return "already-imported" as const;
      throw Error("Target already holds a different run; refusing to import again.");
    }
    for (const name of applicationModels) {
      if (await (tx as unknown as Record<string, Delegate>)[modelInfo(name).delegate].count() > 0) throw Error(`Target table ${name} is not empty; refusing to import.`);
    }
    await tx.legacyImportRun.create({ data: { runId: manifest.runId, manifestSha256: digest, sourceSha256: manifest.sourceSha256, schemaSignature: manifest.schemaSignature } });
    for (const name of applicationModels) {
      const rows = manifest.tables[name].rows.map(row => Object.fromEntries(Object.entries(row).map(([field, value]) => [field, toDatabase(value)])));
      // Bound parameters only; every row keeps its original ID and values.
      if (rows.length) await (tx as unknown as Record<string, Delegate>)[modelInfo(name).delegate].createMany({ data: rows });
    }
    return "imported" as const;
  }, { isolationLevel: "Serializable", maxWait: 10_000, timeout: 600_000 });
  return { status, runId: manifest.runId };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  (async () => {
    const config = readConfig(), db = new PrismaClient({ datasourceUrl: config.targetDatabaseUrl });
    try {
      const manifest = JSON.parse(readFileSync(config.manifest, "utf8")) as Manifest, started = Date.now();
      const result = await importEmptyTarget(db, manifest), report = await verifyEquivalent(db, manifest);
      console.log(JSON.stringify({ ...result, importMs: Date.now() - started, report }));
      if (!report.passed) process.exitCode = 1;
    } finally { await db.$disconnect(); }
  })().catch(error => { console.error(safeError(error)); process.exitCode = 1; });
}
