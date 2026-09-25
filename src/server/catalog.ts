import type { CatalogShow, Prisma, PrismaClient } from "@prisma/client";
import type { EpisodeSource, ShowArtwork, Snapshot } from "./tvmaze";
import { AppError } from "./errors";

const hour = 3600_000, day = 24 * hour;
export type CatalogSource = Pick<EpisodeSource, "snapshot"> & { updates(since: "week" | null): Promise<Map<number, number>>; artwork(id: number): Promise<ShowArtwork> };
const message = (error: unknown) => error instanceof AppError ? error.message : "TVmaze kon deze serie nu niet leveren. Bestaande gegevens blijven behouden.";

// One process: a show is fetched at most once at a time, whoever asks.
const shared = globalThis as typeof globalThis & { w2wCatalogFlights?: Map<number, Promise<CatalogShow>> };
const flights = shared.w2wCatalogFlights ??= new Map<number, Promise<CatalogShow>>();
function singleFlight(tvmazeId: number, work: () => Promise<CatalogShow>) {
  const running = flights.get(tvmazeId);
  if (running) return running;
  const flight = work().finally(() => flights.delete(tvmazeId));
  flights.set(tvmazeId, flight);
  return flight;
}

const showData = (snapshot: Snapshot) => {
  const { name: title, url: sourceUrl, year, poster, platform, country, status, summaryText, genres, runtimeMinutes } = snapshot.show;
  return { title, sourceUrl, year, poster, platform, country, status, summaryText, genresJson: JSON.stringify(genres), runtimeMinutes };
};

/** Applies a complete, validated snapshot in one transaction; only then are missing episodes marked absent. */
async function applySnapshot(db: PrismaClient, snapshot: Snapshot, now: Date, appliedVersion?: number | null) {
  return db.$transaction(async tx => {
    const show = await tx.catalogShow.upsert({ where: { tvmazeId: snapshot.show.id },
      create: { tvmazeId: snapshot.show.id, ...showData(snapshot), lastAttemptAt: now, lastSuccessAt: now, lastFullCheckAt: now, appliedSourceUpdatedAt: appliedVersion ?? null },
      update: { ...showData(snapshot), lastAttemptAt: now, lastSuccessAt: now, lastFullCheckAt: now, lastError: null,
        ...(appliedVersion != null ? { appliedSourceUpdatedAt: appliedVersion } : {}) } });
    await tx.catalogEpisode.updateMany({ where: { catalogShowId: show.id, sourceId: { notIn: snapshot.episodes.map(e => e.id) } }, data: { present: false } });
    for (const e of snapshot.episodes) {
      const data = { title: e.name, season: e.season, number: e.number, airdate: e.airdate, sourceUrl: e.url, present: true, summaryText: e.summaryText };
      await tx.catalogEpisode.upsert({ where: { catalogShowId_sourceId: { catalogShowId: show.id, sourceId: e.id } }, create: { catalogShowId: show.id, sourceId: e.id, ...data }, update: data });
    }
    return show;
  });
}

async function fetchAndApply(db: PrismaClient, source: CatalogSource, tvmazeId: number, now: Date, appliedVersion?: number | null) {
  let snapshot: Snapshot;
  try { snapshot = await source.snapshot(tvmazeId); }
  catch (error) {
    // A failure or partial answer keeps every stored episode; the show stays due for a retry.
    await db.catalogShow.updateMany({ where: { tvmazeId }, data: { lastAttemptAt: now, lastError: message(error) } });
    throw error;
  }
  return applySnapshot(db, snapshot, now, appliedVersion);
}

/**
 * Complete stored catalog version of a show. A snapshot checked within the last hour is reused, so a new
 * follower or a manual sync never forces one fetch per user.
 */
export function ensureCatalogSnapshot(db: PrismaClient, source: CatalogSource, tvmazeId: number, now = new Date()): Promise<CatalogShow> {
  return singleFlight(tvmazeId, async () => {
    const existing = await db.catalogShow.findUnique({ where: { tvmazeId } });
    if (existing?.lastFullCheckAt && +now - +existing.lastFullCheckAt < hour && existing.lastSuccessAt) return existing;
    return fetchAndApply(db, source, tvmazeId, now, existing?.observedSourceUpdatedAt);
  });
}

/** Artwork at most weekly per show, remembering absence; an error retries after a day and never blocks episodes. */
async function refreshArtwork(db: PrismaClient | Prisma.TransactionClient, source: CatalogSource, show: CatalogShow, now: Date) {
  if (show.artworkNextCheckAt && show.artworkNextCheckAt > now) return;
  let artwork = { bannerUrl: show.bannerUrl, backgroundUrl: show.backgroundUrl }, delay = 7 * day;
  try { artwork = await source.artwork(show.tvmazeId); } catch { delay = day; }
  await db.catalogShow.update({ where: { id: show.id }, data: { ...artwork, artworkNextCheckAt: new Date(+now + delay) } });
}

export type RefreshReport = { checked: number; fetched: number; failed: number; errors: { tvmazeId: number; message: string }[]; index: "week" | "full" | "failed" };

/**
 * Daily: one index check for all followed shows, then only changed, unapplied, failed or week-old shows are fetched.
 * observed is stored independently; applied only rises after a complete snapshot transaction.
 */
export async function refreshFollowedCatalog(db: PrismaClient, source: CatalogSource, now = new Date()): Promise<RefreshReport> {
  const shows = await db.catalogShow.findMany({ where: { follows: { some: { user: { accessStatus: "ACTIVE" } } } }, orderBy: { tvmazeId: "asc" } });
  const installation = await db.installation.findUnique({ where: { id: "singleton" }, select: { catalogIndexCheckedAt: true } });
  const recent = installation?.catalogIndexCheckedAt && +now - +installation.catalogIndexCheckedAt <= 6 * day;
  const report: RefreshReport = { checked: shows.length, fetched: 0, failed: 0, errors: [], index: recent ? "week" : "full" };
  let index = new Map<number, number>();
  try {
    index = await source.updates(recent ? "week" : null);
    await db.installation.updateMany({ where: { id: "singleton" }, data: { catalogIndexCheckedAt: now } });
  } catch { report.index = "failed"; }
  for (const show of shows) {
    const seen = index.get(show.tvmazeId), observed = Math.max(seen ?? 0, show.observedSourceUpdatedAt ?? 0) || null;
    if (seen && seen > (show.observedSourceUpdatedAt ?? 0)) await db.catalogShow.update({ where: { id: show.id }, data: { observedSourceUpdatedAt: seen } });
    const due = (observed ?? 0) > (show.appliedSourceUpdatedAt ?? 0) || !show.lastFullCheckAt || +now - +show.lastFullCheckAt >= 7 * day
      || !!show.lastError || report.index === "failed" && !show.lastSuccessAt;
    let current = show;
    if (due) {
      try { current = await fetchAndApply(db, source, show.tvmazeId, now, observed); report.fetched++; }
      catch (error) { report.failed++; report.errors.push({ tvmazeId: show.tvmazeId, message: message(error) }); continue; }
    }
    await refreshArtwork(db, source, current, now);
  }
  return report;
}
