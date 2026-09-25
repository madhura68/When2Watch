// IDEA-219 P10 deletion journal operator tool. Prints ids-free counts only.
//   init  — at R2 cutover: creates the empty journal (W2W_DELETION_JOURNAL) and binds it to this installation.
//   apply — after restoring a database backup, before app and cron start: re-applies every journalled deletion.
//   check — validates the journal against this installation.
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { PrismaClient } from "@prisma/client";
import { applyDeletionJournal, initJournal, journalPath, readJournal } from "../src/server/privacy";
import { safeError } from "./migration/manifest";

export async function run(db: PrismaClient, command: string, path = journalPath()) {
  const installation = await db.installation.findUnique({ where: { id: "singleton" }, select: { deletionJournalId: true } });
  if (!installation) throw Error("No installation in this database.");
  if (command === "init") {
    if (installation.deletionJournalId) throw Error("This installation already has a journal; restore that file instead of creating a new one.");
    const journalId = randomUUID();
    initJournal(path, journalId);
    await db.installation.update({ where: { id: "singleton" }, data: { deletionJournalId: journalId } });
    return { status: "INITIALISED" };
  }
  if (command === "check") return { status: "VALID", entries: readJournal(path, installation.deletionJournalId).size };
  if (command === "apply") return { status: "APPLIED", ...await applyDeletionJournal(db, path) };
  throw Error("Use init, check or apply.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const db = new PrismaClient();
  run(db, process.argv[2] ?? "").then(report => console.log(JSON.stringify(report)))
    .catch(error => { console.error(safeError(error)); process.exitCode = 1; }).finally(() => db.$disconnect());
}
