import type { CatalogEpisode, CatalogShow } from "@prisma/client";
import { nextDate } from "@/lib/dates";
import type { CalendarEvent } from "./google-calendar";
import type { SyncSettings } from "./sync-settings";
export type EventContext = SyncSettings & { userId: string; origin: string };
export type ShowFields = Pick<CatalogShow, "title" | "tvmazeId" | "platform" | "country" | "runtimeMinutes">;
export type EpisodeFields = Pick<CatalogEpisode, "sourceId" | "title" | "season" | "number" | "airdate" | "sourceUrl">;
export type Providers = { country: string; names: string[] } | null;
export const markers = (userId: string, showId: number, episodeId: number) => ({ app: "when2watch", kind: "episode", userId, showId: String(showId), episodeId: String(episodeId) });
export function desiredEpisodeEvent(ctx: EventContext, show: ShowFields, e: EpisodeFields, eventId: string, _providers?: Providers): CalendarEvent {
  const code = e.season !== null && e.number !== null ? ` S${String(e.season).padStart(2,"0")}E${String(e.number).padStart(2,"0")}` : "";
  return { id: eventId, summary: `${show.title}${code}${e.title ? ` — ${e.title}` : ""}`,
    description: `Oorspronkelijke uitzenddatum volgens TVmaze; beschikbaarheid in Nederland kan afwijken.\n${e.sourceUrl}\nBron: TVmaze (CC BY-SA).`,
    start: { date: e.airdate! }, end: { date: nextDate(e.airdate!) }, transparency: "transparent",
    reminders: { useDefault: true }, extendedProperties: { private: markers(ctx.userId, show.tvmazeId, e.sourceId) } };
}
