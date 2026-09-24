import { createHash, randomUUID } from "node:crypto";
import type { CalendarEventLink, Episode, PrismaClient, TrackedShow } from "@prisma/client";
import { localDate, nextDate } from "@/lib/dates";
import { serializeCalendarMutation } from "./calendar-mutations";
import { AppError } from "./errors";
import { GoogleCalendar, type CalendarEvent } from "./google-calendar";
import type { EpisodeSource, Snapshot } from "./tvmaze";
import { refreshBanner } from "./banners";

export type SeriesResult = { showId: number; title: string; created: number; updated: number; deleted: number; unchanged: number; failed: number; errors: string[] };
export type SyncResult = { id: string; status: "success" | "partial" | "failed"; calendarState?: "unconfigured"; startedAt: string; finishedAt: string; series: SeriesResult[] };
export type SyncConfiguration = { calendarId: string; timeZone: string };
type EpisodeWithLinks = Episode & { links: CalendarEventLink[] };
const markers = (userId: string, showId: number, episodeId: number) => ({ app: "when2watch", kind: "episode", userId, showId: String(showId), episodeId: String(episodeId) });
const failure = (error: unknown) => error instanceof AppError ? error.message : "Synchroniseren is onderbroken. Probeer opnieuw; bewaarde koppelingen blijven behouden.";
export const calendarEventHash = (event: CalendarEvent) => createHash("sha256").update(JSON.stringify([
  event.summary ?? "", event.description ?? "", event.start?.date ?? null, event.start?.dateTime ?? null,
  event.end?.date ?? null, event.end?.dateTime ?? null, event.transparency ?? "opaque",
  event.reminders?.useDefault ?? false, event.reminders?.overrides ?? [],
  Object.entries(event.extendedProperties?.private ?? {}).sort(([a],[b]) => a.localeCompare(b)),
])).digest("hex");
const pending = (link?: CalendarEventLink) => !!link && ["prepared", "updating", "deleting"].includes(link.status);

export function episodeEvent(userId: string, show: Pick<TrackedShow, "title" | "tvmazeId">, e: Episode, eventId: string): CalendarEvent {
  const code = e.season !== null && e.number !== null ? ` S${String(e.season).padStart(2,"0")}E${String(e.number).padStart(2,"0")}` : "";
  return { id: eventId, summary: `${show.title}${code}${e.title ? ` — ${e.title}` : ""}`,
    description: `Oorspronkelijke uitzenddatum volgens TVmaze; beschikbaarheid in Nederland kan afwijken.\n${e.sourceUrl}\nBron: TVmaze (CC BY-SA).`,
    start: { date: e.airdate! }, end: { date: nextDate(e.airdate!) }, transparency: "transparent",
    reminders: { useDefault: true }, extendedProperties: { private: markers(userId, show.tvmazeId, e.sourceId) } };
}

export class SyncService {
  constructor(private readonly db: PrismaClient, private readonly google: GoogleCalendar, private readonly source: EpisodeSource,
    private readonly config: SyncConfiguration | (() => Promise<SyncConfiguration>), private readonly now = () => new Date()) {}

  private async configured() {
    return typeof this.config === "function" ? new SyncService(this.db, this.google, this.source, await this.config(), this.now) : this;
  }
  private get settings(): SyncConfiguration {
    if (typeof this.config === "function") throw new Error("Configuration must be resolved inside the owner lock");
    return this.config;
  }

  add(userId: string, tvmazeId: number): Promise<SyncResult> {
    return serializeCalendarMutation(userId, async () => (await this.configured()).addLocked(userId, tvmazeId));
  }

  private async addLocked(userId: string, tvmazeId: number) {
      const snapshot = await this.source.snapshot(tvmazeId);
      const show = await this.db.trackedShow.upsert({ where: { userId_tvmazeId: { userId, tvmazeId } },
        create: { userId, tvmazeId, ...this.showData(snapshot) }, update: this.showData(snapshot) });
      return this.run(userId, "add", [show], snapshot);
  }

  sync(userId: string, trigger: "manual" | "cron"): Promise<SyncResult> {
    return serializeCalendarMutation(userId, async () => (await this.configured()).run(userId, trigger,
      await this.db.trackedShow.findMany({ where: { userId }, orderBy: { id: "asc" } })), trigger === "cron");
  }

  private showData(snapshot: Snapshot) {
    const { name: title, url: sourceUrl, year, poster, platform, country, status, summaryText, genres, runtimeMinutes } = snapshot.show;
    return { title, sourceUrl, year, poster, platform, country, status, summaryText, genresJson: JSON.stringify(genres), runtimeMinutes };
  }

  private async run(userId: string, trigger: string, shows: TrackedShow[], initial?: Snapshot): Promise<SyncResult> {
    const started = this.now(), cutoffDate = new Date(`${localDate(started, this.settings.timeZone)}T00:00:00Z`);
    cutoffDate.setUTCDate(cutoffDate.getUTCDate() - 7);
    const cutoff = cutoffDate.toISOString().slice(0, 10);
    const run = await this.db.syncRun.create({ data: { userId, trigger, startedAt: started } });
    const series: SeriesResult[] = [];
    const choice = await this.db.calendarSettings.findUnique({ where: { userId } });
    for (const show of shows) {
      const result: SeriesResult = { showId: show.tvmazeId, title: show.title, created: 0, updated: 0, deleted: 0, unchanged: 0, failed: 0, errors: [] };
      series.push(result);
      await this.db.trackedShow.update({ where: { id: show.id }, data: { lastAttemptAt: started } });
      try {
        // Validate the entire source snapshot before changing rows or Calendar.
        const snapshot = initial?.show.id === show.tvmazeId ? initial : await this.source.snapshot(show.tvmazeId);
        const previous = await this.db.episode.findMany({ where: { trackedShowId: show.id } });
        const oldDates = new Map(previous.map(e => [e.sourceId, e.airdate]));
        await this.db.$transaction(async tx => {
          await tx.trackedShow.update({ where: { id: show.id }, data: this.showData(snapshot) });
          await tx.episode.updateMany({ where: { trackedShowId: show.id }, data: { present: false } });
          for (const e of snapshot.episodes) {
            const data = { title: e.name, season: e.season, number: e.number, airdate: e.airdate, sourceUrl: e.url, present: true, summaryText: e.summaryText };
            await tx.episode.upsert({ where: { trackedShowId_sourceId: { trackedShowId: show.id, sourceId: e.id } },
              create: { ...data, trackedShowId: show.id, sourceId: e.id }, update: data });
          }
        });
        result.title = snapshot.show.name;
        if (this.source.banner) await refreshBanner(this.db, { banner: id => this.source.banner!(id) }, show, started);
        if (choice) {
        if (choice.calendarId !== this.settings.calendarId) throw new AppError("CONFIRM_CALENDAR", 409, "Controleer en bevestig eerst de When2Watch-agenda bij Instellingen.");
        await this.google.calendar(choice.calendarId);
        const remote = await this.google.ownedEpisodes(choice.calendarId, userId, show.tvmazeId);
        const episodes = await this.db.episode.findMany({ where: { trackedShowId: show.id }, include: { links: { where: { calendarId: choice.calendarId } } }, orderBy: { sourceId: "asc" } });
        for (const episode of episodes) {
          try { await this.syncEpisode(userId, { ...show, title: snapshot.show.name }, episode, oldDates.get(episode.sourceId) ?? null, cutoff, remote, result); }
          catch (error) { result.failed++; result.errors.push(`${episode.season ?? "?"}×${episode.number ?? "?"}: ${failure(error)}`); }
        }
        }
      } catch (error) { result.failed++; result.errors.push(failure(error)); }
      await this.db.trackedShow.update({ where: { id: show.id }, data: result.failed
        ? { lastError: result.errors.join("\n") }
        : { lastError: null, lastSuccessAt: this.now() } });
    }
    const failed = series.reduce((n,s) => n+s.failed,0), succeeded = series.reduce((n,s) => n+s.created+s.updated+s.deleted+s.unchanged,0);
    const result: SyncResult = { id: run.id, status: failed ? (succeeded ? "partial" : "failed") : "success", ...(!choice ? { calendarState: "unconfigured" as const } : {}), startedAt: started.toISOString(), finishedAt: this.now().toISOString(), series };
    await this.db.syncRun.update({ where: { id: run.id }, data: { status: result.status, finishedAt: new Date(result.finishedAt), resultJson: JSON.stringify(result) } });
    return result;
  }


  private assertOwned(event: CalendarEvent, userId: string, showId: number, episodeId: number): void {
    if (!event.id || !event.etag || !Object.entries(markers(userId,showId,episodeId)).every(([key,value]) => event.extendedProperties?.private?.[key] === value)) {
      throw new AppError("EVENT_OWNERSHIP", 409, "Een agenda-item heeft een afwijkende markering. Het item is niet gewijzigd.");
    }
  }

  private async read(eventId: string): Promise<CalendarEvent | null> {
    try { const event = await this.google.event(this.settings.calendarId, eventId); return event.status === "cancelled" ? null : event; }
    catch (error) { if (error instanceof AppError && [404,410].includes(error.status)) return null; throw error; }
  }

  private async confirm(link: CalendarEventLink, desired: CalendarEvent, userId: string, showId: number, episodeId: number): Promise<void> {
    const event = await this.read(link.eventId);
    if (!event) throw new AppError("EVENT_UNCONFIRMED", 502, "Google heeft het agenda-item nog niet bevestigd. Probeer opnieuw.");
    this.assertOwned(event,userId,showId,episodeId);
    // Google canonicalizes all-day defaults. Remember its confirmed representation
    // separately from the desired payload, so unchanged runs perform no writes.
    if (event.id !== desired.id || calendarEventHash({ ...event, reminders: desired.reminders }) !== calendarEventHash(desired)) {
      throw new AppError("EVENT_UNCONFIRMED", 502, "Het teruggelezen agenda-item wijkt af. Probeer opnieuw.");
    }
    await this.db.calendarEventLink.update({ where: { id: link.id }, data: { status: "synced", desiredJson: JSON.stringify(desired),
      lastDate: desired.start.date, confirmedDesiredHash: calendarEventHash(desired), confirmedRemoteHash: calendarEventHash(event) } });
  }

  private async syncEpisode(userId: string, show: TrackedShow, episode: EpisodeWithLinks, oldDate: string | null,
    cutoff: string, allRemote: CalendarEvent[], result: SeriesResult): Promise<void> {
    let link: CalendarEventLink | undefined = episode.links[0];
    const within = (date: string | null | undefined) => !!date && date >= cutoff;
    const candidates = allRemote.filter(e => e.status !== "cancelled" && Object.entries(markers(userId, show.tvmazeId, episode.sourceId)).every(([k,v]) => e.extendedProperties?.private?.[k] === v));
    // Missing mappings can still have an owned remote date inside the window.
    if (!within(episode.airdate) && !within(oldDate) && !within(link?.lastDate) && !candidates.some(e => within(e.start?.date)) && !pending(link)) return;
    if (candidates.length > 1) throw new AppError("DUPLICATE_EVENTS", 409, "Meerdere eigen agenda-items voor deze aflevering gevonden. Los dit conflict eerst op.");
    let event: CalendarEvent | null = candidates[0] ?? (link ? await this.read(link.eventId) : null);
    if (event) this.assertOwned(event,userId,show.tvmazeId,episode.sourceId);
    if (event && link && event.id !== link.eventId && link.status !== "deleted") throw new AppError("EVENT_CONFLICT", 409, "De opgeslagen koppeling wijkt af van het gevonden agenda-item.");
    if (!link && event) link = await this.db.calendarEventLink.create({ data: { episodeId: episode.id, calendarId: this.settings.calendarId,
      eventId: event.id, status: "synced", desiredJson: "{}", lastDate: event.start?.date ?? null } });

    const wanted = episode.present && episode.airdate !== null;
    if ((!wanted || link?.status === "deleting") && link && link.status !== "deleted") {
      await this.db.calendarEventLink.update({ where: { id: link.id }, data: { status: "deleting" } });
      if (event) {
        await this.google.remove(this.settings.calendarId, event.id, event.etag!);
        if (await this.read(event.id)) throw new AppError("DELETE_UNCONFIRMED", 502, "De verwijdering is nog niet bevestigd. Probeer opnieuw.");
      }
      link = await this.db.calendarEventLink.update({ where: { id: link.id }, data: { status: "deleted" } });
      result.deleted++; event = null;
    }
    if (!wanted) return;
    // Old history is never newly created just because an absent mapping used to
    // point into the window. Existing events may still be corrected backwards.
    if (!event && !within(episode.airdate) && !pending(link)) return;
    if (!event && (!link || link.status === "synced" || link.status === "deleted")) {
      const eventId = `e${randomUUID().replaceAll("-", "")}`;
      const data = { eventId, status: "prepared", desiredJson: JSON.stringify(episodeEvent(userId,show,episode,eventId)), lastDate: episode.airdate,
        confirmedDesiredHash: null, confirmedRemoteHash: null };
      link = link ? await this.db.calendarEventLink.update({ where: { id: link.id }, data })
        : await this.db.calendarEventLink.create({ data: { ...data, episodeId: episode.id, calendarId: this.settings.calendarId } });
    }
    if (!link) throw new AppError("MAPPING_MISSING", 500, "De agendakoppeling ontbreekt.");
    const desired = episodeEvent(userId,show,episode,link.eventId);
    if (!event) {
      // Persist intent before POST. A lost response is recovered by GET of this ID.
      await this.db.calendarEventLink.update({ where: { id: link.id }, data: { desiredJson: JSON.stringify(desired), status: "prepared" } });
      try { await this.google.insert(this.settings.calendarId, desired); }
      catch (error) { if (!(error instanceof AppError && error.status === 409)) throw error; }
      await this.confirm(link,desired,userId,show.tvmazeId,episode.sourceId); result.created++; return;
    }
    if (link.confirmedDesiredHash === calendarEventHash(desired) && link.confirmedRemoteHash === calendarEventHash(event)) { result.unchanged++; return; }
    if ((!link.confirmedDesiredHash || pending(link)) && calendarEventHash({ ...event, reminders: desired.reminders }) === calendarEventHash(desired)) {
      await this.confirm(link,desired,userId,show.tvmazeId,episode.sourceId); result.unchanged++; return;
    }
    await this.db.calendarEventLink.update({ where: { id: link.id }, data: { desiredJson: JSON.stringify(desired), status: "updating" } });
    await this.google.patch(this.settings.calendarId, event.id, desired, event.etag!);
    await this.confirm(link,desired,userId,show.tvmazeId,episode.sourceId); result.updated++;
  }
}
