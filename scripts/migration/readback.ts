/**
 * Cutover dry-run: read back every stored own Calendar event by GET only and classify it
 * the way SyncService would, without Calendar writes and without database writes.
 * Run behind maintenance, before opening the app and scheduler:
 *   DATABASE_URL=<private env> npx tsx scripts/migration/readback.ts --authorized-readback
 */
import { clientSecretOf, open } from "../../src/server/credentials";
import { pathToFileURL } from "node:url";
import { PrismaClient } from "@prisma/client";
import { AppError } from "../../src/server/errors";
import { GoogleCalendar } from "../../src/server/google-calendar";
import { googleTokenRefresher } from "../../src/server/google-tokens";
import { calendarEventHash, episodeEvent } from "../../src/server/sync";
import { safeError } from "./manifest";

export type ReadbackReport = { links: number; unchanged: number; remoteChanged: number; sourceChanged: number; missing: number; foreign: number; pending: number; deleted: number; otherCalendar: number };

/** Anything but unchanged or explained source changes must be investigated before opening. */
export const readbackNeedsAttention = (report: ReadbackReport) =>
  report.missing + report.foreign + report.remoteChanged + report.pending + report.otherCalendar > 0;

/** Wraps a fetcher so that only GET requests can leave the process. */
export function readOnlyFetch(fetcher: typeof fetch = fetch): typeof fetch {
  return async (input, init) => {
    const method = (init?.method ?? "GET").toUpperCase();
    if (method !== "GET") throw Error(`Refusing ${method}: the readback is read-only.`);
    return fetcher(input, init);
  };
}

export async function readbackOwnEvents(db: PrismaClient, google: GoogleCalendar, userId: string, calendarId: string): Promise<ReadbackReport> {
  const report: ReadbackReport = { links: 0, unchanged: 0, remoteChanged: 0, sourceChanged: 0, missing: 0, foreign: 0, pending: 0, deleted: 0, otherCalendar: 0 };
  // R2 links carry their owner; R1 links are owned through the legacy series.
  const own = { OR: [{ userId }, { episode: { show: { userId } } }] };
  report.otherCalendar = await db.calendarEventLink.count({ where: { calendarId: { not: calendarId }, ...own } });
  const links = await db.calendarEventLink.findMany({ where: { calendarId, ...own }, include: { episode: { include: { show: true } }, catalogEpisode: { include: { show: true } } }, orderBy: { id: "asc" } });
  for (const link of links) {
    report.links++;
    if (link.status === "deleted") { report.deleted++; continue; }
    if (link.status !== "synced") { report.pending++; continue; }
    const episode = link.catalogEpisode ?? link.episode!, show = episode.show;
    let event;
    try { event = await google.event(calendarId, link.eventId); }
    catch (error) { if (error instanceof AppError && [404, 410].includes(error.status)) { report.missing++; continue; } throw error; }
    if (event.status === "cancelled") { report.missing++; continue; }
    const marker = event.extendedProperties?.private ?? {};
    if (marker.app !== "when2watch" || marker.kind !== "episode" || marker.userId !== userId || marker.showId !== String(show.tvmazeId) || marker.episodeId !== String(episode.sourceId)) { report.foreign++; continue; }
    if (calendarEventHash(event) !== link.confirmedRemoteHash) { report.remoteChanged++; continue; }
    // A stored TVmaze change since the last sync is expected work for the first sync, not a migration effect.
    if (!episode.present || !episode.airdate || calendarEventHash(episodeEvent(userId, show, episode, link.eventId)) !== link.confirmedDesiredHash) { report.sourceChanged++; continue; }
    report.unchanged++;
  }
  return report;
}

async function main() {
  if (!process.argv.includes("--authorized-readback")) throw Error("Explicit --authorized-readback is required.");
  const db = new PrismaClient();
  try {
    // One user per run (default: the installation owner); the user's own active binding and its account.
    const installation = await db.installation.findUniqueOrThrow({ where: { id: "singleton" } });
    const userId = process.argv.find(arg => arg.startsWith("--user="))?.slice(7) ?? installation.ownerId;
    if (!userId) throw Error("No user to read back.");
    const binding = await db.calendarBinding.findFirst({ where: { userId, status: "ACTIVE" }, include: { account: { include: { oauthClient: true } } } });
    if (!binding?.account) throw Error("This user has no active calendar binding with a proven account.");
    const settings = { calendarId: binding.calendarId }, account = binding.account;
    // Token is refreshed in memory only; the target database stays untouched.
    let token: string | undefined = account.access_token && (account.expires_at ?? 0) > Date.now() / 1000 + 60 ? open(account.access_token, "account.access_token", account.id) : undefined;
    const accessToken = async () => {
      if (token) return token;
      if (!account.refresh_token || !account.oauthClient) throw Error("No usable refresh token; reconnect after opening.");
      const refreshed = await googleTokenRefresher(account.oauthClient.clientId, clientSecretOf(account.oauthClient))(open(account.refresh_token, "account.refresh_token", account.id));
      if (!refreshed.access_token) throw Error("Token refresh returned no access token.");
      return token = refreshed.access_token;
    };
    const report = await readbackOwnEvents(db, new GoogleCalendar(accessToken, readOnlyFetch()), userId, settings.calendarId);
    console.log(JSON.stringify(report));
    if (readbackNeedsAttention(report)) process.exitCode = 2;
  } finally { await db.$disconnect(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(error => { console.error(safeError(error)); process.exitCode = 1; });
