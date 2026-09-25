/**
 * IDEA-219 R2 (P4): map the legacy per-user tables onto the shared catalog and explicit ownership.
 * One transaction, bound to a run ID, no network. Legacy rows stay untouched except for the new
 * nullable ownership columns on CalendarEventLink/Probe and User.role/accessStatus.
 * Run on a frozen database behind maintenance:
 *   W2W_BACKFILL_RUN_ID=<id> W2W_BACKFILL_SOURCE_CHECKSUM=<sha> DATABASE_URL=<migrator> npx tsx scripts/migration/backfill-catalog.ts
 */
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { Prisma, PrismaClient, type AccessStatus, type BindingProvenance, type BindingStatus, type Role } from "@prisma/client";
import { safeError } from "./manifest";

const phase = "catalog-backfill";
const provenCreation = ["created", "ready", "selected"];

export async function loadLegacy(db: PrismaClient | Prisma.TransactionClient) {
  const [users, installation, calendarSettings, creations, shows, episodes, links, probes, accounts] = await Promise.all([
    db.user.findMany({ select: { id: true }, orderBy: { id: "asc" } }),
    db.installation.findUnique({ where: { id: "singleton" } }),
    db.calendarSettings.findMany({ orderBy: { userId: "asc" } }),
    db.calendarCreationAttempt.findMany({ orderBy: { id: "asc" } }),
    db.trackedShow.findMany({ orderBy: { id: "asc" } }),
    db.episode.findMany({ orderBy: { id: "asc" } }),
    db.calendarEventLink.findMany({ orderBy: { id: "asc" } }),
    db.probe.findMany({ orderBy: { id: "asc" } }),
    db.account.findMany({ select: { id: true, userId: true }, orderBy: { id: "asc" } }),
  ]);
  return { users, installation, calendarSettings, creations, shows, episodes, links, probes, accounts };
}
export type LegacySource = Awaited<ReturnType<typeof loadLegacy>>;

class Refused extends Error {}

/** Pure mapping; throws instead of guessing whenever ownership is not provable. */
export function planBackfill(source: LegacySource, newId: () => string = randomUUID) {
  const { installation } = source;
  const ownerId = installation?.ownerId;
  if (source.users.length && !ownerId) throw new Refused("Unknown owner: Installation.ownerId is missing; refusing to choose an admin.");
  const accountOwner = new Map(source.accounts.map(a => [a.id, a.userId]));
  const activeAccountId = installation?.activeAccountId ?? null;
  if (activeAccountId && accountOwner.get(activeAccountId) !== ownerId) throw new Refused("The installation's active account does not belong to the owner.");

  const users = source.users.map(u => u.id === ownerId
    ? { id: u.id, role: "ADMIN" as Role, accessStatus: "ACTIVE" as AccessStatus }
    : { id: u.id, role: "USER" as Role, accessStatus: "UNCLAIMED" as AccessStatus });

  // Canonical show per TVmaze ID: newest successful snapshot, then stable id order.
  const order = (a: LegacySource["shows"][number], b: LegacySource["shows"][number]) =>
    (b.lastSuccessAt?.getTime() ?? -1) - (a.lastSuccessAt?.getTime() ?? -1) || a.id.localeCompare(b.id);
  const byTvmaze = new Map<number, LegacySource["shows"]>();
  for (const show of source.shows) byTvmaze.set(show.tvmazeId, [...(byTvmaze.get(show.tvmazeId) ?? []), show]);
  const episodesByShow = new Map<string, LegacySource["episodes"]>();
  for (const episode of source.episodes) episodesByShow.set(episode.trackedShowId, [...(episodesByShow.get(episode.trackedShowId) ?? []), episode]);

  const catalogShows: Prisma.CatalogShowCreateManyInput[] = [], catalogEpisodes: Prisma.CatalogEpisodeCreateManyInput[] = [];
  const maps: { kind: string; oldId: string; newId: string }[] = [], catalogShowOf = new Map<string, string>(), catalogEpisodeOf = new Map<string, string>();
  for (const [tvmazeId, snapshots] of [...byTvmaze].sort(([a], [b]) => a - b)) {
    const ordered = [...snapshots].sort(order), chosen = ordered[0], id = newId();
    const bySource = new Map<number, { id: string; episode: LegacySource["episodes"][number] }>();
    let needsReconcile = false;
    for (const snapshot of ordered) {
      for (const episode of episodesByShow.get(snapshot.id) ?? []) {
        const existing = bySource.get(episode.sourceId);
        if (!existing) bySource.set(episode.sourceId, { id: newId(), episode });
        else if (existing.episode.airdate !== episode.airdate || existing.episode.present !== episode.present) needsReconcile = true;
        catalogEpisodeOf.set(episode.id, (existing ?? bySource.get(episode.sourceId)!).id);
      }
    }
    catalogShows.push({ id, tvmazeId, title: chosen.title, sourceUrl: chosen.sourceUrl, year: chosen.year, poster: chosen.poster,
      bannerUrl: chosen.bannerUrl, backgroundUrl: chosen.backgroundUrl, artworkNextCheckAt: chosen.bannerNextCheckAt, platform: chosen.platform,
      country: chosen.country, status: chosen.status, summaryText: chosen.summaryText, genresJson: chosen.genresJson, runtimeMinutes: chosen.runtimeMinutes,
      lastAttemptAt: chosen.lastAttemptAt, lastSuccessAt: chosen.lastSuccessAt, lastError: chosen.lastError, needsReconcile });
    for (const { id: episodeId, episode } of [...bySource.values()].sort((a, b) => a.episode.sourceId - b.episode.sourceId)) {
      catalogEpisodes.push({ id: episodeId, catalogShowId: id, sourceId: episode.sourceId, title: episode.title, season: episode.season, number: episode.number,
        airdate: episode.airdate, sourceUrl: episode.sourceUrl, present: episode.present, summaryText: episode.summaryText });
    }
    for (const snapshot of snapshots) { catalogShowOf.set(snapshot.id, id); maps.push({ kind: "show", oldId: snapshot.id, newId: snapshot.id }); }
  }
  for (const episode of source.episodes) maps.push({ kind: "episode", oldId: episode.id, newId: catalogEpisodeOf.get(episode.id)! });

  // The follow keeps the legacy TrackedShow id, so personal references stay stable.
  const follows = source.shows.map(show => ({ id: show.id, userId: show.userId, catalogShowId: catalogShowOf.get(show.id)!, trying: show.trying,
    lastAttemptAt: show.lastAttemptAt, lastSuccessAt: show.lastSuccessAt, lastError: show.lastError }));

  // Bindings: only the owner's current calendar is active; history is kept but never activated.
  const bindings: Prisma.CalendarBindingCreateManyInput[] = [], bindingOf = new Map<string, string>();
  const creationProof = (userId: string, calendarId: string) => source.creations.find(c => c.ownerId === userId && c.calendarId === calendarId
    && provenCreation.includes(c.status) && accountOwner.get(c.accountId) === userId);
  const metadata = new Map(source.calendarSettings.map(c => [`${c.userId}\n${c.calendarId}`, { summary: c.summary, timeZone: c.timeZone,
    accessRole: c.accessRole, defaultRemindersJson: c.defaultRemindersJson, confirmedAt: c.confirmedAt }]));
  const addBinding = (userId: string, calendarId: string, active: boolean) => {
    const key = `${userId}\n${calendarId}`;
    if (bindingOf.has(key)) return;
    const proof = creationProof(userId, calendarId);
    const provenance: BindingProvenance = proof && (!active || proof.accountId === activeAccountId) ? "APP_CREATED" : "LEGACY_UNVERIFIED";
    const accountId = active ? activeAccountId : proof?.accountId ?? null;
    const status: BindingStatus = active ? "ACTIVE" : accountId ? "INACTIVE" : "LEGACY_UNRESOLVED";
    const id = newId(); bindingOf.set(key, id);
    bindings.push({ id, userId, calendarId, accountId, status, provenance, ...metadata.get(key) });
  };
  const ownerCalendar = ownerId ? source.calendarSettings.find(s => s.userId === ownerId)?.calendarId ?? installation?.initialCalendarId ?? null : null;
  if (ownerCalendar) {
    if (!activeAccountId) throw new Refused("The owner's active calendar has no proven active account; refusing an ambiguous binding.");
    addBinding(ownerId!, ownerCalendar, true);
  }
  for (const settings of source.calendarSettings) addBinding(settings.userId, settings.calendarId, false);
  const showOwner = new Map(source.shows.map(s => [s.id, s.userId])), episodeOwner = new Map(source.episodes.map(e => [e.id, showOwner.get(e.trackedShowId)!]));
  for (const link of source.links) {
    if (!link.episodeId || !episodeOwner.has(link.episodeId)) throw new Refused("A calendar link has no owning series.");
    addBinding(episodeOwner.get(link.episodeId)!, link.calendarId, false);
  }
  for (const probe of source.probes) addBinding(probe.userId, probe.calendarId, false);

  const linkUpdates = source.links.map(link => {
    const userId = episodeOwner.get(link.episodeId!)!;
    return { id: link.id, userId, bindingId: bindingOf.get(`${userId}\n${link.calendarId}`)!, catalogEpisodeId: catalogEpisodeOf.get(link.episodeId!)! };
  });
  const seen = new Set<string>();
  for (const update of linkUpdates) {
    const key = `${update.bindingId}\n${update.catalogEpisodeId}`;
    if (seen.has(key)) throw new Refused("Mapping collision: two calendar links map to the same shared episode in one binding; resolve manually.");
    seen.add(key);
  }
  const probeUpdates = source.probes.map(probe => ({ id: probe.id, bindingId: bindingOf.get(`${probe.userId}\n${probe.calendarId}`)! }));
  const connection = ownerId && activeAccountId ? { userId: ownerId, accountId: activeAccountId } : null;
  const report = { users: users.length, catalogShows: catalogShows.length, catalogEpisodes: catalogEpisodes.length, follows: follows.length,
    bindings: bindings.length, links: linkUpdates.length, probes: probeUpdates.length, needsReconcile: catalogShows.filter(s => s.needsReconcile).length };
  return { users, catalogShows, catalogEpisodes, follows, bindings, connection, linkUpdates, probeUpdates, maps, report };
}

export async function backfillCatalog(db: PrismaClient, { runId, sourceChecksum }: { runId: string; sourceChecksum: string }) {
  return db.$transaction(async tx => {
    const previous = await tx.migrationRun.findFirst({ where: { phase } });
    if (previous) {
      if (previous.id === runId && previous.completedAt) return { status: "already-completed" as const, report: JSON.parse(previous.reportJson ?? "{}") };
      throw new Refused("A different catalog backfill run already exists; refusing to remap.");
    }
    if (await tx.catalogShow.count() || await tx.userFollow.count() || await tx.calendarBinding.count() || await tx.userConnection.count()
      || await tx.calendarEventLink.count({ where: { bindingId: { not: null } } })) throw new Refused("Target already holds R2 data without a backfill run.");
    const plan = planBackfill(await loadLegacy(tx));
    await tx.migrationRun.create({ data: { id: runId, phase, sourceChecksum, schemaVersion: "20260925200000_r2_expand_catalog_and_users" } });
    for (const user of plan.users) await tx.user.update({ where: { id: user.id }, data: { role: user.role, accessStatus: user.accessStatus } });
    await tx.catalogShow.createMany({ data: plan.catalogShows });
    await tx.catalogEpisode.createMany({ data: plan.catalogEpisodes });
    await tx.userFollow.createMany({ data: plan.follows });
    await tx.calendarBinding.createMany({ data: plan.bindings });
    if (plan.connection) await tx.userConnection.create({ data: plan.connection });
    for (const link of plan.linkUpdates) await tx.calendarEventLink.update({ where: { id: link.id }, data: { userId: link.userId, bindingId: link.bindingId, catalogEpisodeId: link.catalogEpisodeId } });
    for (const probe of plan.probeUpdates) await tx.probe.update({ where: { id: probe.id }, data: { bindingId: probe.bindingId } });
    await tx.migrationMap.createMany({ data: plan.maps.map(map => ({ runId, ...map })) });
    // Activating R2 signs everyone out: sessions were issued under the single-owner rules.
    const sessionsRevoked = (await tx.session.deleteMany({})).count;
    Object.assign(plan.report, { sessionsRevoked });
    await tx.migrationRun.update({ where: { id: runId }, data: { completedAt: new Date(), reportJson: JSON.stringify(plan.report) } });
    return { status: "backfilled" as const, report: plan.report };
  }, { isolationLevel: "Serializable", maxWait: 10_000, timeout: 600_000 });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const runId = process.env.W2W_BACKFILL_RUN_ID, sourceChecksum = process.env.W2W_BACKFILL_SOURCE_CHECKSUM;
  const db = new PrismaClient();
  (async () => {
    if (!runId || !sourceChecksum) throw Error("Set W2W_BACKFILL_RUN_ID and W2W_BACKFILL_SOURCE_CHECKSUM.");
    console.log(JSON.stringify(await backfillCatalog(db, { runId, sourceChecksum })));
  })().catch(error => { console.error(safeError(error)); process.exitCode = 1; }).finally(() => db.$disconnect());
}
