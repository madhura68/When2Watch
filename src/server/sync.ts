import { createHash, randomUUID } from "node:crypto";
import type { CalendarBinding, CalendarEventLink, CatalogEpisode, CatalogShow, PrismaClient, UserFollow } from "@prisma/client";
import { localDate, nextDate } from "@/lib/dates";
import { serializeCalendarMutation } from "./calendar-mutations";
import { AppError } from "./errors";
import { GoogleCalendar, type CalendarEvent } from "./google-calendar";
import { ensureCatalogSnapshot, refreshCatalogArtwork, type CatalogSource } from "./catalog";
import { bindingUsable } from "./calendar-bindings";

export type SeriesResult = { showId: number; title: string; created: number; updated: number; deleted: number; unchanged: number; failed: number; errors: string[] };
export type SyncResult = { id: string; status: "success" | "partial" | "failed"; calendarState?: "unconfigured" | "paused"; startedAt: string; finishedAt: string; series: SeriesResult[] };
export type SyncConfiguration = { calendarId: string; timeZone: string };
export type SyncSource = Pick<CatalogSource, "snapshot"> & Partial<Pick<CatalogSource, "artwork">>;
type EpisodeFields = Pick<CatalogEpisode, "sourceId" | "title" | "season" | "number" | "airdate" | "sourceUrl">;
type EpisodeWithLinks = CatalogEpisode & { links: CalendarEventLink[] };
const markers = (userId: string, showId: number, episodeId: number) => ({ app: "when2watch", kind: "episode", userId, showId: String(showId), episodeId: String(episodeId) });
const failure = (error: unknown) => error instanceof AppError ? error.message : "Synchroniseren is onderbroken. Probeer opnieuw; bewaarde koppelingen blijven behouden.";
export const calendarEventHash = (event: CalendarEvent) => createHash("sha256").update(JSON.stringify([
  event.summary ?? "", event.description ?? "", event.start?.date ?? null, event.start?.dateTime ?? null,
  event.end?.date ?? null, event.end?.dateTime ?? null, event.transparency ?? "opaque",
  event.reminders?.useDefault ?? false, event.reminders?.overrides ?? [],
  Object.entries(event.extendedProperties?.private ?? {}).sort(([a],[b]) => a.localeCompare(b)),
])).digest("hex");
const pending = (link?: CalendarEventLink) => !!link && ["prepared", "updating", "deleting"].includes(link.status);

export function episodeEvent(userId: string, show: { title: string; tvmazeId: number }, e: EpisodeFields, eventId: string): CalendarEvent {
  const code = e.season !== null && e.number !== null ? ` S${String(e.season).padStart(2,"0")}E${String(e.number).padStart(2,"0")}` : "";
  return { id: eventId, summary: `${show.title}${code}${e.title ? ` — ${e.title}` : ""}`,
    description: `Oorspronkelijke uitzenddatum volgens TVmaze; beschikbaarheid in Nederland kan afwijken.\n${e.sourceUrl}\nBron: TVmaze (CC BY-SA).`,
    start: { date: e.airdate! }, end: { date: nextDate(e.airdate!) }, transparency: "transparent",
    reminders: { useDefault: true }, extendedProperties: { private: markers(userId, show.tvmazeId, e.sourceId) } };
}

type Options = { sourceMaxAgeMs?: number };

/**
 * Personal reconciliation over the shared catalog: the user's own follows, own active binding and own event links.
 * The source refresh is separate, so an unchanged source still repairs or creates this user's events.
 */
export class SyncService {
  constructor(private readonly db: PrismaClient, private readonly google: GoogleCalendar, private readonly source: SyncSource,
    private readonly config: SyncConfiguration | (() => Promise<SyncConfiguration>), private readonly now = () => new Date(), private readonly options: Options = {}) {}

  private async configured() {
    return typeof this.config === "function" ? new SyncService(this.db, this.google, this.source, await this.config(), this.now, this.options) : this;
  }
  private get settings(): SyncConfiguration {
    if (typeof this.config === "function") throw new Error("Configuration must be resolved inside the user lock");
    return this.config;
  }
  private get catalogSource(): CatalogSource {
    return { snapshot: id => this.source.snapshot(id), artwork: id => this.source.artwork ? this.source.artwork(id) : Promise.reject(new Error("no artwork source")),
      updates: () => Promise.reject(new Error("updates are read by the scheduled refresh")) };
  }

  add(userId: string, tvmazeId: number, trying = false): Promise<SyncResult> {
    return serializeCalendarMutation(userId, async () => (await this.configured()).addLocked(userId, tvmazeId, trying));
  }

  private async addLocked(userId: string, tvmazeId: number, trying: boolean) {
    const show = await ensureCatalogSnapshot(this.db, this.catalogSource, tvmazeId, this.now(), this.options.sourceMaxAgeMs);
    if (this.source.artwork) await refreshCatalogArtwork(this.db, this.catalogSource, show, this.now());
    // A delayed add never undoes a later Proberen choice of the same user.
    const follow = await this.db.userFollow.upsert({ where: { userId_catalogShowId: { userId, catalogShowId: show.id } }, create: { userId, catalogShowId: show.id, trying }, update: {} });
    return this.run(userId, "add", [follow], { refresh: false });
  }

  /** Manual sync reuses a recent source check; the scheduler refreshes the catalog once beforehand (refresh: false). */
  sync(userId: string, trigger: "manual" | "cron", options: { refresh?: boolean } = {}): Promise<SyncResult> {
    return serializeCalendarMutation(userId, async () => (await this.configured()).run(userId, trigger,
      await this.db.userFollow.findMany({ where: { userId }, orderBy: { id: "asc" } }), { refresh: options.refresh ?? trigger === "manual" }), trigger === "cron");
  }

  /** Stop following: remove only this user's own events and relation; other users and the shared catalog stay. */
  unfollow(userId: string, tvmazeId: number): Promise<{ removed: number }> {
    return serializeCalendarMutation(userId, async () => (await this.configured()).unfollowLocked(userId, tvmazeId));
  }

  private async unfollowLocked(userId: string, tvmazeId: number) {
    const follow = await this.db.userFollow.findFirst({ where: { userId, show: { tvmazeId } }, include: { show: true } });
    if (!follow) throw new AppError("NOT_FOUND", 404, "Deze serie staat niet in jouw overzicht.");
    const binding = await this.activeBinding(userId);
    const account = binding?.accountId ? await this.db.account.findUnique({ where: { id: binding.accountId } }) : null;
    let removed = 0;
    // With a paused binding a 404 may only mean "no access": keep those links as history instead of calling them deleted.
    if (binding && account && bindingUsable(binding, account) === "ok") {
      const links = await this.db.calendarEventLink.findMany({ where: { userId, bindingId: binding.id, status: { not: "deleted" }, catalogEpisode: { catalogShowId: follow.catalogShowId } }, include: { catalogEpisode: true } });
      for (const link of links) {
        await this.db.calendarEventLink.update({ where: { id: link.id }, data: { status: "deleting" } });
        const event = await this.read(link.eventId);
        if (event) {
          this.assertOwned(event, userId, tvmazeId, link.catalogEpisode!.sourceId);
          await this.google.remove(this.settings.calendarId, event.id, event.etag!);
          if (await this.read(event.id)) throw new AppError("DELETE_UNCONFIRMED", 502, "De verwijdering is nog niet bevestigd. Probeer opnieuw.");
        }
        await this.db.calendarEventLink.update({ where: { id: link.id }, data: { status: "deleted" } });
        removed++;
      }
    }
    await this.db.userFollow.delete({ where: { id: follow.id } });
    return { removed };
  }

  private async activeBinding(userId: string): Promise<CalendarBinding | null> {
    const binding = await this.db.calendarBinding.findFirst({ where: { userId, status: "ACTIVE" } });
    return binding && binding.calendarId === this.settings.calendarId ? binding : null;
  }

  private async run(userId: string, trigger: string, follows: UserFollow[], options: { refresh: boolean }): Promise<SyncResult> {
    const started = this.now(), cutoffDate = new Date(`${localDate(started, this.settings.timeZone)}T00:00:00Z`);
    cutoffDate.setUTCDate(cutoffDate.getUTCDate() - 7);
    const cutoff = cutoffDate.toISOString().slice(0, 10);
    const run = await this.db.syncRun.create({ data: { userId, trigger, startedAt: started } });
    const series: SeriesResult[] = [];
    const active = await this.activeBinding(userId);
    // Narrow grants: an unproven (legacy) calendar or missing grants pause Calendar work; local data still refreshes.
    const account = active?.accountId ? await this.db.account.findUnique({ where: { id: active.accountId } }) : null;
    const paused = !!active && (!account || bindingUsable(active, account) !== "ok");
    const binding = paused ? null : active;
    for (const follow of follows) {
      let show = await this.db.catalogShow.findUniqueOrThrow({ where: { id: follow.catalogShowId } });
      const result: SeriesResult = { showId: show.tvmazeId, title: show.title, created: 0, updated: 0, deleted: 0, unchanged: 0, failed: 0, errors: [] };
      series.push(result);
      await this.db.userFollow.update({ where: { id: follow.id }, data: { lastAttemptAt: started } });
      try {
        // Blocking waits for this lock; still re-check access before each show's external work.
        if ((await this.db.user.findUnique({ where: { id: userId }, select: { accessStatus: true } }))?.accessStatus !== "ACTIVE") {
          throw new AppError("UNAUTHORIZED", 401, "De toegang van dit account is ingetrokken.");
        }
        const previous = await this.db.catalogEpisode.findMany({ where: { catalogShowId: show.id } });
        const oldDates = new Map(previous.map(e => [e.sourceId, e.airdate]));
        if (options.refresh) {
          show = await ensureCatalogSnapshot(this.db, this.catalogSource, show.tvmazeId, started, this.options.sourceMaxAgeMs);
          // Weekly at most; an artwork failure never blocks the episodes below.
          if (this.source.artwork) await refreshCatalogArtwork(this.db, this.catalogSource, show, started);
        }
        else if (!show.lastSuccessAt) throw new AppError("SOURCE_UNAVAILABLE", 502, "Deze serie is nog niet volledig opgehaald. De volgende synchronisatie probeert het opnieuw.");
        result.title = show.title;
        if (binding) {
          if (show.needsReconcile) throw new AppError("NEEDS_RECONCILE", 409, "Deze serie wacht op een gecontroleerde broncontrole; agenda-items blijven ongewijzigd.");
          await this.google.calendar(binding.calendarId);
          const remote = await this.google.ownedEpisodes(binding.calendarId, userId, show.tvmazeId);
          const episodes = await this.db.catalogEpisode.findMany({ where: { catalogShowId: show.id }, include: { links: { where: { bindingId: binding.id } } }, orderBy: { sourceId: "asc" } });
          for (const episode of episodes) {
            try { await this.syncEpisode(userId, show, binding, episode, oldDates.get(episode.sourceId) ?? null, cutoff, remote, result); }
            catch (error) { result.failed++; result.errors.push(`${episode.season ?? "?"}×${episode.number ?? "?"}: ${failure(error)}`); }
          }
        }
      } catch (error) { result.failed++; result.errors.push(failure(error)); }
      await this.db.userFollow.update({ where: { id: follow.id }, data: result.failed
        ? { lastError: result.errors.join("\n") }
        : { lastError: null, lastSuccessAt: this.now() } });
    }
    const failed = series.reduce((n,s) => n+s.failed,0), succeeded = series.reduce((n,s) => n+s.created+s.updated+s.deleted+s.unchanged,0);
    const result: SyncResult = { id: run.id, status: failed ? (succeeded ? "partial" : "failed") : "success", ...(paused ? { calendarState: "paused" as const } : !binding ? { calendarState: "unconfigured" as const } : {}), startedAt: started.toISOString(), finishedAt: this.now().toISOString(), series };
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

  private async syncEpisode(userId: string, show: CatalogShow, binding: CalendarBinding, episode: EpisodeWithLinks, oldDate: string | null,
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
    const ownership = { userId, bindingId: binding.id, catalogEpisodeId: episode.id, calendarId: binding.calendarId };
    if (!link && event) link = await this.db.calendarEventLink.create({ data: { ...ownership, eventId: event.id, status: "synced", desiredJson: "{}", lastDate: event.start?.date ?? null } });

    const wanted = episode.present && episode.airdate !== null;
    if ((!wanted || link?.status === "deleting") && link && link.status !== "deleted") {
      await this.db.calendarEventLink.update({ where: { id: link.id }, data: { status: "deleting" } });
      if (event) {
        await this.google.remove(binding.calendarId, event.id, event.etag!);
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
        : await this.db.calendarEventLink.create({ data: { ...data, ...ownership } });
    }
    if (!link) throw new AppError("MAPPING_MISSING", 500, "De agendakoppeling ontbreekt.");
    const desired = episodeEvent(userId,show,episode,link.eventId);
    if (!event) {
      // Persist intent before POST. A lost response is recovered by GET of this ID.
      await this.db.calendarEventLink.update({ where: { id: link.id }, data: { desiredJson: JSON.stringify(desired), status: "prepared" } });
      try { await this.google.insert(binding.calendarId, desired); }
      catch (error) { if (!(error instanceof AppError && error.status === 409)) throw error; }
      await this.confirm(link,desired,userId,show.tvmazeId,episode.sourceId); result.created++; return;
    }
    if (link.confirmedDesiredHash === calendarEventHash(desired) && link.confirmedRemoteHash === calendarEventHash(event)) { result.unchanged++; return; }
    if ((!link.confirmedDesiredHash || pending(link)) && calendarEventHash({ ...event, reminders: desired.reminders }) === calendarEventHash(desired)) {
      await this.confirm(link,desired,userId,show.tvmazeId,episode.sourceId); result.unchanged++; return;
    }
    await this.db.calendarEventLink.update({ where: { id: link.id }, data: { desiredJson: JSON.stringify(desired), status: "updating" } });
    await this.google.patch(binding.calendarId, event.id, desired, event.etag!);
    await this.confirm(link,desired,userId,show.tvmazeId,episode.sourceId); result.updated++;
  }
}
