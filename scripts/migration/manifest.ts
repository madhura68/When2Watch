/** IDEA-219 R1: shared contract of the lossless SQLite → PostgreSQL migration (manifest v1). */
import { createHash } from "node:crypto";
import { chmodSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { Prisma } from "@prisma/client";

/** The 15 application models of release 53a8a2f, in foreign-key insert order. */
export const applicationModels = [
  "User", "OAuthClientConfig", "Account", "Session", "VerificationToken", "UserPreferences", "CalendarSettings", "Probe",
  "TrackedShow", "Episode", "CalendarEventLink", "SyncRun", "Installation", "GoogleConnectionAttempt", "CalendarCreationAttempt",
] as const;
export type ModelName = typeof applicationModels[number];

export type Value = string | number | boolean | null | { $date: string };
export type Row = Record<string, Value>;
export type Manifest = {
  version: 1; runId: string; exportedAt: string; schemaSignature: string; sourceSha256: string; migrations: string[];
  tables: Record<ModelName, { count: number; key: string[]; rows: Row[] }>;
};

type Field = { name: string; type: "String" | "Int" | "Boolean" | "DateTime"; required: boolean };
export type ModelInfo = { name: ModelName; delegate: string; fields: Field[]; key: string[]; relations: { from: string[]; model: ModelName; to: string[] }[] };

/** Columns of the archived release-53a8a2f SQLite schema: the manifest contract, whatever the live schema adds later. */
let legacy: Map<string, Set<string>> | undefined;
function legacyColumns(name: ModelName) {
  if (!legacy) {
    const sqlite = new DatabaseSync(":memory:");
    try {
      for (const { name: migration } of archivedMigrations()) sqlite.exec(readFileSync(join(archivedRoot, migration, "migration.sql"), "utf8"));
      legacy = new Map(applicationModels.map(model => [model, new Set((sqlite.prepare(`PRAGMA table_info("${model}")`).all() as { name: string }[]).map(c => c.name))]));
    } finally { sqlite.close(); }
  }
  return legacy.get(name)!;
}

export function modelInfo(name: ModelName): ModelInfo {
  const model = Prisma.dmmf.datamodel.models.find(item => item.name === name);
  if (!model) throw Error(`Unknown model ${name}.`);
  const columns = legacyColumns(name);
  const fields = model.fields.filter(field => field.kind === "scalar" && columns.has(field.name)).map(field => {
    if (!["String", "Int", "Boolean", "DateTime"].includes(field.type)) throw Error(`Unsupported field type ${name}.${field.name}.`);
    return { name: field.name, type: field.type as Field["type"], required: field.isRequired };
  });
  const key = model.fields.filter(field => field.isId).map(field => field.name);
  const fallback = model.primaryKey?.fields ?? model.fields.filter(field => field.isUnique).map(field => field.name).slice(0, 1);
  const relations = model.fields.filter(field => field.kind === "object" && field.relationFromFields?.length
    && (applicationModels as readonly string[]).includes(field.type) && field.relationFromFields.every(from => columns.has(from))).map(field => ({
    from: [...field.relationFromFields!], model: field.type as ModelName, to: [...field.relationToFields!],
  }));
  return { name, delegate: name[0].toLowerCase() + name.slice(1), fields, key: key.length ? key : [...fallback], relations };
}

export const keyOf = (info: ModelInfo, row: Row) => JSON.stringify(info.key.map(field => row[field]));
export const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
export const manifestSha256 = (manifest: Manifest) => sha256(JSON.stringify(manifest));

const archivedRoot = "prisma/legacy-sqlite/migrations";
/** Name + SQL checksum of every archived SQLite migration, as Prisma records them in _prisma_migrations. */
export function archivedMigrations() {
  return readdirSync(archivedRoot).filter(name => /^\d/.test(name)).sort()
    .map(name => ({ name, checksum: sha256(readFileSync(join(archivedRoot, name, "migration.sql"))) }));
}

/** Signature of the application table DDL; `_prisma_migrations` and SQLite internals excluded. */
export function schemaSignature(sqlite: DatabaseSync) {
  const rows = sqlite.prepare(`SELECT type, name, sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' AND tbl_name <> '_prisma_migrations' ORDER BY type, name`).all() as { type: string; name: string; sql: string }[];
  return sha256(rows.map(row => `${row.type}:${row.name}:${row.sql.replace(/\s+/g, " ").trim()}`).join("\n"));
}

let expected: string | undefined;
export function archivedSchemaSignature() {
  if (expected) return expected;
  const sqlite = new DatabaseSync(":memory:");
  try { for (const { name } of archivedMigrations()) sqlite.exec(readFileSync(join(archivedRoot, name, "migration.sql"), "utf8")); return expected = schemaSignature(sqlite); }
  finally { sqlite.close(); }
}

export const toDatabase = (value: Value) => value && typeof value === "object" ? new Date(value.$date) : value;
export const fromDatabase = (value: unknown): Value => value instanceof Date ? { $date: value.toISOString() } : value as Value;

/** Private operator configuration: absolute path, mode 0600. Connection strings never travel via argv or logs. */
export type MigrationConfig = { sourceSqlite: string; manifest: string; runId: string; targetDatabaseUrl: string };
export function readConfig(): MigrationConfig {
  const path = process.env.W2W_MIGRATION_CONFIG;
  if (!path || !isAbsolute(path)) throw Error("Set W2W_MIGRATION_CONFIG to an absolute private JSON path.");
  if ((statSync(path).mode & 0o077) !== 0) throw Error("The migration configuration must have mode 0600.");
  const config = JSON.parse(readFileSync(path, "utf8")) as MigrationConfig;
  for (const key of ["sourceSqlite", "manifest"] as const) if (!isAbsolute(config[key] ?? "")) throw Error(`${key} must be an absolute path.`);
  return config;
}

export function writePrivateJson(path: string, value: unknown) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  if ((statSync(dirname(path)).mode & 0o077) !== 0) throw Error("The manifest directory must have mode 0700.");
  writeFileSync(path, JSON.stringify(value), { mode: 0o600 });
  chmodSync(path, 0o600);
}

/** CLI error text: Prisma messages can echo row values (tokens), so only their code is shown. */
export function safeError(error: unknown) {
  const value = error as { code?: string; clientVersion?: string; message?: string };
  return value?.clientVersion ? `Database error ${value.code ?? "without code"}` : value?.message ?? "Unknown error";
}

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
