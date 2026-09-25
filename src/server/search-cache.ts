import type { PrismaClient } from "@prisma/client";
import type { Show } from "./tvmaze";

const hour = 3600_000, emptyTtl = 10 * 60_000, capacity = 1000;
export type SearchSource = { search(query: string): Promise<Show[]> };

/** Cache key: trim, Unicode NFC, lowercase, collapsed whitespace. No user identity or history. */
export const searchKey = (query: string) => query.normalize("NFC").trim().toLowerCase().replace(/\s+/g, " ");

// One process: identical concurrent searches share one source request.
const shared = globalThis as typeof globalThis & { w2wSearchFlights?: Map<string, Promise<Show[]>> };
const flights = shared.w2wSearchFlights ??= new Map<string, Promise<Show[]>>();

export async function cachedSearch(db: PrismaClient, source: SearchSource, query: string, now = new Date()): Promise<Show[]> {
  const key = searchKey(query);
  const hit = await db.searchCache.findUnique({ where: { key } });
  if (hit && hit.expiresAt > now) return JSON.parse(hit.resultJson) as Show[];
  const running = flights.get(key);
  if (running) return running;
  // Deliberately not bound to the caller's request: one client cancelling does not break it for others.
  const flight = (async () => {
    const shows = await source.search(query);
    await db.searchCache.upsert({ where: { key }, create: { key, resultJson: JSON.stringify(shows), expiresAt: new Date(+now + (shows.length ? hour : emptyTtl)), createdAt: now },
      update: { resultJson: JSON.stringify(shows), expiresAt: new Date(+now + (shows.length ? hour : emptyTtl)), createdAt: now } });
    await enforceCapacity(db, now);
    return shows;
  })().finally(() => flights.delete(key));
  flights.set(key, flight);
  return flight;
}

export async function enforceCapacity(db: PrismaClient, now: Date) {
  const excess = await db.searchCache.count() - capacity;
  if (excess <= 0) return;
  await db.searchCache.deleteMany({ where: { expiresAt: { lte: now } } });
  const still = await db.searchCache.count() - capacity;
  if (still <= 0) return;
  const oldest = await db.searchCache.findMany({ orderBy: [{ createdAt: "asc" }, { key: "asc" }], take: still, select: { key: true } });
  await db.searchCache.deleteMany({ where: { key: { in: oldest.map(row => row.key) } } });
}
