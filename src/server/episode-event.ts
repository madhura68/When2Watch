import { formatInZone, resolveWallTime } from "./event-time";
import type { CatalogEpisode, CatalogShow } from "@prisma/client";
import { nextDate } from "@/lib/dates";
import type { CalendarEvent } from "./google-calendar";
import type { SyncSettings } from "./sync-settings";
export type EventContext = SyncSettings & { userId: string; origin: string };
export type ShowFields = Pick<CatalogShow, "title" | "tvmazeId" | "platform" | "country" | "runtimeMinutes">;
export type EpisodeFields = Pick<CatalogEpisode, "sourceId" | "title" | "season" | "number" | "airdate" | "sourceUrl">;
export type Providers = { country: string; names: string[] } | null;
export const markers = (userId: string, showId: number, episodeId: number) => ({ app: "when2watch", kind: "episode", userId, showId: String(showId), episodeId: String(episodeId) });
export function desiredEpisodeEvent(ctx: EventContext, show: ShowFields, e: EpisodeFields, eventId: string, providers?: Providers): CalendarEvent {
  const code = e.season !== null && e.number !== null ? `S${String(e.season).padStart(2,"0")}E${String(e.number).padStart(2,"0")}` : null;
  const available = providers && providers.names.length > 0 ? providers : null;
  const description = [show.platform ? `Originally on ${show.platform}${show.country ? ` (${show.country})` : ""}.` : "Original broadcaster not known.",
    "Original release date according to TVmaze.", `Episode: ${e.sourceUrl}`, `When2Watch: ${ctx.origin}/following#show-${show.tvmazeId}`, "Source: TVmaze (CC BY-SA).",
    ...(available ? ["Watch availability: JustWatch via TMDB."] : [])].join("\n");
  const begin = ctx.eventMode === "FIXED_TIME" ? resolveWallTime(e.airdate!, ctx.eventTime!, ctx.timeZone) : null;
  return { id: eventId, summary: [show.title, code, e.title].filter(Boolean).join(" · "), description,
    ...(available ? {location: `${available.country}: ${available.names.join(", ")}`} : {}),
    start: begin ? {dateTime: formatInZone(begin, ctx.timeZone), timeZone: ctx.timeZone} : {date: e.airdate!},
    end: begin ? {dateTime: formatInZone(new Date(begin.getTime() + (show.runtimeMinutes ?? 60) * 60000), ctx.timeZone), timeZone: ctx.timeZone} : {date: nextDate(e.airdate!)},
    transparency: "transparent", reminders: {useDefault: true}, extendedProperties: {private: markers(ctx.userId, show.tvmazeId, e.sourceId)} };
}
