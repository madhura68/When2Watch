/**
 * Read-only, lossless export of a frozen legacy SQLite backup into manifest v1.
 * Run: W2W_MIGRATION_CONFIG=/abs/private/config.json npx tsx scripts/migration/sqlite-export.ts
 */
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { pathToFileURL } from "node:url";
import {
  applicationModels, archivedMigrations, archivedSchemaSignature, modelInfo, readConfig, safeError, schemaSignature, sha256, writePrivateJson,
  type Manifest, type Row, type Value,
} from "./manifest";

// SQLite text from DEFAULT CURRENT_TIMESTAMP is UTC without a zone marker.
const sqliteText = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})(\.\d{1,3})?$/;
const isoUtc = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;

function convert(where: string, type: string, required: boolean, raw: unknown): Value {
  const fail = (): never => { throw Error(`${where}: unsupported stored value of SQLite type ${raw === null ? "null" : typeof raw}.`); };
  if (raw === null) return required ? fail() : null;
  switch (type) {
    case "String": return typeof raw === "string" ? raw : fail();
    case "Int": return typeof raw === "number" && Number.isSafeInteger(raw) ? raw : typeof raw === "bigint" ? fail() : fail();
    case "Boolean":
      if (raw === 0 || raw === 1) return raw === 1;
      if (raw === "true" || raw === "false") return raw === "true";
      return fail();
    case "DateTime": {
      let ms: number | undefined;
      if (typeof raw === "number" && Number.isSafeInteger(raw)) ms = raw;
      else if (typeof raw === "string" && sqliteText.test(raw)) { const [, day, time, fraction = ""] = sqliteText.exec(raw)!; ms = Date.parse(`${day}T${time}${fraction}Z`); }
      else if (typeof raw === "string" && isoUtc.test(raw)) ms = Date.parse(raw);
      if (ms === undefined || Number.isNaN(ms)) return fail();
      return { $date: new Date(ms).toISOString() };
    }
  }
  return fail();
}

export function exportSqlite(path: string, { runId, now = new Date() }: { runId: string; now?: Date }): Manifest {
  if (!/^[0-9a-f-]{36}$/.test(runId)) throw Error("runId must be a UUID.");
  const sourceSha256 = sha256(readFileSync(path));
  const sqlite = new DatabaseSync(path, { readOnly: true });
  try {
    if ((sqlite.prepare("PRAGMA integrity_check").get() as { integrity_check: string }).integrity_check !== "ok") throw Error("Source integrity_check failed.");
    const violations = sqlite.prepare("PRAGMA foreign_key_check").all();
    if (violations.length) throw Error(`Source has ${violations.length} foreign key violation(s); refusing to repair.`);
    const signature = schemaSignature(sqlite);
    if (signature !== archivedSchemaSignature()) throw Error("Source schema does not match the archived SQLite schema of release 53a8a2f.");
    const applied = sqlite.prepare(`SELECT migration_name AS name, checksum, finished_at IS NOT NULL AS finished, rolled_back_at IS NOT NULL AS rolledBack FROM _prisma_migrations ORDER BY migration_name`).all() as { name: string; checksum: string; finished: number; rolledBack: number }[];
    const archived = archivedMigrations();
    if (applied.some(row => !row.finished || row.rolledBack) || JSON.stringify(applied.map(({ name, checksum }) => ({ name, checksum }))) !== JSON.stringify(archived)) {
      throw Error("Source migration history does not match the archived SQLite migrations.");
    }
    const tables = {} as Manifest["tables"];
    for (const name of applicationModels) {
      const info = modelInfo(name);
      const columns = (sqlite.prepare(`PRAGMA table_info("${name}")`).all() as { name: string }[]).map(column => column.name).sort();
      if (JSON.stringify(columns) !== JSON.stringify(info.fields.map(field => field.name).sort())) throw Error(`${name}: columns differ from the model.`);
      const rows = (sqlite.prepare(`SELECT * FROM "${name}" ORDER BY ${info.key.map(key => `"${key}"`).join(",")}`).all() as Record<string, unknown>[])
        .map(raw => Object.fromEntries(info.fields.map(field => [field.name, convert(`${name}.${field.name}`, field.type, field.required, raw[field.name])])) as Row);
      tables[name] = { count: rows.length, key: info.key, rows };
    }
    return { version: 1, runId, exportedAt: now.toISOString(), schemaSignature: signature, sourceSha256, migrations: archived.map(item => item.name), tables };
  } finally { sqlite.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const config = readConfig(), manifest = exportSqlite(config.sourceSqlite, { runId: config.runId });
    writePrivateJson(config.manifest, manifest);
    console.log(JSON.stringify({ runId: manifest.runId, sourceSha256: manifest.sourceSha256, schemaSignature: manifest.schemaSignature,
      tableCounts: Object.fromEntries(Object.entries(manifest.tables).map(([name, table]) => [name, table.count])) }));
  } catch (error) { console.error(safeError(error)); process.exitCode = 1; }
}
