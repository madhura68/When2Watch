/**
 * Independent check of a completed catalog backfill: every legacy row is accounted for exactly once.
 * Reports counts per problem kind only.
 *   W2W_BACKFILL_RUN_ID=<id> DATABASE_URL=<private> npx tsx scripts/migration/verify-catalog.ts
 */
import { pathToFileURL } from "node:url";
import { PrismaClient } from "@prisma/client";
import { safeError } from "./manifest";

export async function verifyCatalog(db: PrismaClient, runId: string) {
  const problems: Record<string, number> = {}, flag = (kind: string) => { problems[kind] = (problems[kind] ?? 0) + 1; };
  const run = await db.migrationRun.findUnique({ where: { id: runId } });
  if (!run?.completedAt) flag("runNotCompleted");
  const [installation, users, shows, episodes, follows, catalogShows, catalogEpisodes, bindings, links, probes, maps] = await Promise.all([
    db.installation.findUnique({ where: { id: "singleton" } }), db.user.findMany(), db.trackedShow.findMany(), db.episode.findMany(),
    db.userFollow.findMany(), db.catalogShow.findMany(), db.catalogEpisode.findMany(), db.calendarBinding.findMany(),
    db.calendarEventLink.findMany(), db.probe.findMany(), db.migrationMap.findMany({ where: { runId } }),
  ]);
  for (const user of users) {
    const expected = user.id === installation?.ownerId ? ["ADMIN", "ACTIVE"] : ["USER", "UNCLAIMED"];
    if (user.role !== expected[0] || user.accessStatus !== expected[1]) flag("roleMismatch");
  }
  const catalogById = new Map(catalogShows.map(s => [s.id, s])), catalogEpisodeById = new Map(catalogEpisodes.map(e => [e.id, e]));
  const followById = new Map(follows.map(f => [f.id, f])), showById = new Map(shows.map(s => [s.id, s]));
  for (const show of shows) {
    const follow = followById.get(show.id);
    if (!follow || follow.userId !== show.userId || follow.trying !== show.trying || catalogById.get(follow.catalogShowId)?.tvmazeId !== show.tvmazeId) flag("followMismatch");
  }
  if (follows.length !== shows.length) flag("followCount");
  const episodeMap = new Map(maps.filter(m => m.kind === "episode").map(m => [m.oldId, m.newId]));
  for (const episode of episodes) {
    const mapped = catalogEpisodeById.get(episodeMap.get(episode.id) ?? "");
    if (!mapped || mapped.sourceId !== episode.sourceId || catalogById.get(mapped.catalogShowId)?.tvmazeId !== showById.get(episode.trackedShowId)?.tvmazeId) flag("episodeMapping");
  }
  const bindingById = new Map(bindings.map(b => [b.id, b])), episodeById = new Map(episodes.map(e => [e.id, e]));
  for (const link of links) {
    if (!link.episodeId) continue; // catalog-native links are created by R2 sync, not by the backfill
    const owner = showById.get(episodeById.get(link.episodeId)?.trackedShowId ?? "")?.userId, binding = bindingById.get(link.bindingId ?? "");
    if (!owner || link.userId !== owner) flag("linkOwner");
    if (!binding || binding.userId !== owner || binding.calendarId !== link.calendarId) flag("linkBinding");
    if (!link.catalogEpisodeId || link.catalogEpisodeId !== episodeMap.get(link.episodeId)) flag("linkEpisode");
  }
  for (const probe of probes) {
    const binding = bindingById.get(probe.bindingId ?? "");
    if (!binding || binding.userId !== probe.userId || binding.calendarId !== probe.calendarId) flag("probeBinding");
  }
  if (users.filter(u => u.role === "ADMIN").length !== (installation?.ownerId ? 1 : 0)) flag("adminCount");
  const counts = { users: users.length, catalogShows: catalogShows.length, catalogEpisodes: catalogEpisodes.length, follows: follows.length,
    bindings: bindings.length, links: links.length, probes: probes.length, needsReconcile: catalogShows.filter(s => s.needsReconcile).length };
  return { passed: Object.keys(problems).length === 0, counts, problems };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const db = new PrismaClient();
  verifyCatalog(db, process.env.W2W_BACKFILL_RUN_ID ?? "")
    .then(report => { console.log(JSON.stringify(report)); if (!report.passed) process.exitCode = 1; })
    .catch(error => { console.error(safeError(error)); process.exitCode = 1; }).finally(() => db.$disconnect());
}
