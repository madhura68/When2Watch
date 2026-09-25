/**
 * Field-by-field and relation comparison of a PostgreSQL target with manifest v1.
 * The report holds counts only; values (including secrets) are compared in memory.
 * Run: W2W_MIGRATION_CONFIG=/abs/private/config.json npx tsx scripts/migration/verify-import.ts
 */
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { PrismaClient } from "@prisma/client";
import { applicationModels, fromDatabase, keyOf, manifestSha256, modelInfo, readConfig, safeError, validateSource, type Manifest, type ModelName, type Row } from "./manifest";

export type VerifyReport = { passed: boolean; tableCounts: Record<string, number>; differenceCounts: Record<string, number>; durationMs: number };

export async function verifyEquivalent(db: PrismaClient, manifest: Manifest): Promise<VerifyReport> {
  const started = Date.now(), tableCounts: Record<string, number> = {}, differenceCounts: Record<string, number> = {};
  validateSource(manifest);
  // Compare only against the manifest that was actually imported into this target.
  const run = await db.legacyImportRun.findUnique({ where: { id: "legacy-sqlite" } });
  if (!run) throw Error("Target was not imported by the migrator.");
  if (run.runId !== manifest.runId || run.manifestSha256 !== manifestSha256(manifest)) throw Error("Target was imported from a different run or manifest.");
  const target = {} as Record<ModelName, Row[]>;
  for (const name of applicationModels) {
    const rows = await (db as unknown as Record<string, { findMany(): Promise<Record<string, unknown>[]> }>)[modelInfo(name).delegate].findMany();
    target[name] = rows.map(row => Object.fromEntries(Object.entries(row).map(([field, value]) => [field, fromDatabase(value)])));
  }
  for (const name of applicationModels) {
    const info = modelInfo(name), expected = new Map(manifest.tables[name].rows.map(row => [keyOf(info, row), row]));
    const actual = new Map(target[name].map(row => [keyOf(info, row), row]));
    let differences = 0;
    for (const [key, row] of expected) {
      const other = actual.get(key);
      if (!other || info.fields.some(field => JSON.stringify(row[field.name]) !== JSON.stringify(other[field.name]))) differences++;
    }
    differences += [...actual.keys()].filter(key => !expected.has(key)).length;
    // Relations: every non-null foreign key in the target resolves to the referenced row.
    for (const relation of info.relations) {
      const referenced = new Set(target[relation.model].map(row => JSON.stringify(relation.to.map(field => row[field]))));
      differences += target[name].filter(row => relation.from.every(field => row[field] !== null)
        && !referenced.has(JSON.stringify(relation.from.map(field => row[field])))).length;
    }
    tableCounts[name] = target[name].length;
    differenceCounts[name] = differences;
  }
  const passed = Object.values(differenceCounts).every(count => count === 0);
  return { passed, tableCounts, differenceCounts, durationMs: Date.now() - started };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  (async () => {
    const config = readConfig(), db = new PrismaClient({ datasourceUrl: config.targetDatabaseUrl });
    try {
      const report = await verifyEquivalent(db, JSON.parse(readFileSync(config.manifest, "utf8")) as Manifest);
      console.log(JSON.stringify(report));
      if (!report.passed) process.exitCode = 1;
    } finally { await db.$disconnect(); }
  })().catch(error => { console.error(safeError(error)); process.exitCode = 1; });
}
