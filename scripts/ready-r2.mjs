// R2 start gate (run by scripts/start.sh after the schema check). Refuses to serve until the cutover steps
// are complete: catalog backfill done (when legacy data exists), every stored secret sealed, a credential key
// and the deletion journal of this installation present. Prints reasons only, never values.
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { PrismaClient } from "@prisma/client";

export async function r2Problems(db, env = process.env) {
  const problems = [];
  if (!/^[a-zA-Z0-9_-]{1,32}:/.test(env.W2W_CREDENTIAL_KEYS ?? "")) problems.push("W2W_CREDENTIAL_KEYS is missing");
  const legacy = await db.trackedShow.count() + await db.calendarSettings.count();
  if (legacy && !await db.migrationRun.count({ where: { phase: "catalog-backfill", completedAt: { not: null } } })) problems.push("catalog backfill has not completed");
  const unsealed = await db.$queryRaw`SELECT
    (SELECT COUNT(*) FROM "Account" WHERE ("access_token" IS NOT NULL AND "access_token" NOT LIKE 'w2w:v1:%') OR ("refresh_token" IS NOT NULL AND "refresh_token" NOT LIKE 'w2w:v1:%'))
    + (SELECT COUNT(*) FROM "OAuthClientConfig" WHERE "clientSecret" NOT LIKE 'w2w:v1:%')
    + (SELECT COUNT(*) FROM "GoogleConnectionAttempt" WHERE "tokensJson" IS NOT NULL AND "tokensJson" NOT LIKE 'w2w:v1:%') AS n`;
  if (Number(unsealed[0].n) > 0) problems.push("stored secrets are not sealed; run scripts/migration/encrypt-credentials.ts");
  const installation = await db.installation.findUnique({ where: { id: "singleton" }, select: { deletionJournalId: true } });
  if (installation) {
    let header = null;
    try { header = JSON.parse(readFileSync(env.W2W_DELETION_JOURNAL ?? "", "utf8").split("\n")[0]); } catch { /* reported below */ }
    if (!installation.deletionJournalId || header?.journalId !== installation.deletionJournalId) problems.push("deletion journal of this installation is missing; run scripts/restore-privacy.ts init (or restore the journal)");
  }
  return problems;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const db = new PrismaClient();
  r2Problems(db).then(problems => { for (const p of problems) console.error(`Refusing to start: ${p}.`); process.exitCode = problems.length ? 66 : 0; })
    .catch(() => { console.error("Refusing to start: readiness check failed."); process.exitCode = 66; }).finally(() => db.$disconnect());
}
