/**
 * Imports manifest v1 into an empty PostgreSQL target in one transaction, then verifies it.
 * Run: W2W_MIGRATION_CONFIG=/abs/private/config.json npx tsx scripts/migration/import-postgres.ts
 */
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { PrismaClient } from "@prisma/client";
import { applicationModels, archivedMigrations, archivedSchemaSignature, keyOf, manifestSha256, modelInfo, readConfig, safeError, toDatabase, type Manifest } from "./manifest";
import { verifyEquivalent } from "./verify-import";

type Delegate = { count(): Promise<number>; createMany(args: { data: Record<string, unknown>[] }): Promise<{ count: number }> };

export function validateSource(manifest: Manifest) {
  if (manifest?.version !== 1 || !/^[0-9a-f-]{36}$/.test(manifest.runId ?? "")) throw Error("Unsupported manifest version or run ID.");
  if (manifest.schemaSignature !== archivedSchemaSignature()) throw Error("Manifest schema signature is unknown.");
  if (JSON.stringify(manifest.migrations) !== JSON.stringify(archivedMigrations().map(item => item.name))) throw Error("Manifest schema migrations are unknown.");
  if (JSON.stringify(Object.keys(manifest.tables ?? {}).sort()) !== JSON.stringify([...applicationModels].sort())) throw Error("Manifest must contain exactly the 15 application tables.");
  for (const name of applicationModels) {
    const table = manifest.tables[name], info = modelInfo(name);
    if (!Array.isArray(table.rows) || table.count !== table.rows.length) throw Error(`${name}: row count does not match the manifest count.`);
    const keys = new Set<string>();
    for (const row of table.rows) {
      if (JSON.stringify(Object.keys(row).sort()) !== JSON.stringify(info.fields.map(field => field.name).sort())) throw Error(`${name}: row fields differ from the model.`);
      const key = keyOf(info, row);
      if (keys.has(key)) throw Error(`${name}: duplicate key in manifest.`);
      keys.add(key);
    }
  }
}

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
