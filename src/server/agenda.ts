import type { PrismaClient } from "@prisma/client";
import { agendaWindow } from "@/lib/agenda-range";
import { database } from "./db";
import { overview } from "./overview";
import { getPreferences } from "./preferences";

export async function agendaOverview(userId: string, now = new Date(), db: PrismaClient = database()) {
  const preferences = await getPreferences(userId, db);
  const window = agendaWindow(now, preferences.timeZone, preferences.agendaMonths);
  const data = await overview(userId, db, now, preferences.timeZone);
  const episodes = data.shows.flatMap(show => show.upcoming
    .filter(episode => episode.date >= window.from && episode.date < window.untilExclusive)
    .map(episode => ({ ...episode, show: { id: show.id, title: show.title, sourceUrl: show.sourceUrl, platform: show.platform, bannerUrl: show.bannerUrl, backgroundUrl: show.backgroundUrl, poster: show.poster, error: show.error } })))
    .sort((a, b) => a.date.localeCompare(b.date) || a.show.title.localeCompare(b.show.title, "nl") || (a.season ?? Infinity) - (b.season ?? Infinity) || (a.number ?? Infinity) - (b.number ?? Infinity) || a.id - b.id || a.show.id - b.show.id);
  const groups: { date: string; episodes: typeof episodes }[] = [];
  for (const episode of episodes) {
    const last = groups.at(-1);
    if (last?.date === episode.date) last.episodes.push(episode);
    else groups.push({ date: episode.date, episodes: [episode] });
  }
  return { preferences, window, groups, showCount: data.shows.length, calendar: data.calendar, needsReauth: data.needsReauth, lastRun: data.lastRun };
}

export type AgendaOverview = Awaited<ReturnType<typeof agendaOverview>>;
