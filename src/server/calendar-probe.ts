import type { PrismaClient, Probe, CalendarSettings } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { GoogleCalendar, safeEvent, type CalendarEvent } from "./google-calendar";
import { AppError } from "./errors";
import { localDate, nextDate } from "@/lib/dates";
import { serializeCalendarMutation } from "./calendar-mutations";

export class CalendarProbeService {
  constructor(private readonly db: PrismaClient, private readonly google: GoogleCalendar, private readonly config: { calendarId: string; timeZone: string }, private readonly now = () => new Date()) {}
  async verifyCalendar(userId: string): Promise<CalendarSettings> {
    const calendar = await this.google.calendar(this.config.calendarId);
    if (calendar.timeZone !== this.config.timeZone) {
      throw new AppError("WRONG_TIMEZONE", 409, "Zet de gekozen agenda op Europe/Amsterdam voordat je de proef start.");
    }
    const data = {
      calendarId: calendar.id, summary: calendar.summary, timeZone: calendar.timeZone,
      accessRole: calendar.accessRole, defaultRemindersJson: JSON.stringify(calendar.defaultReminders), confirmedAt: this.now(),
    };
    return this.db.calendarSettings.upsert({ where: { userId }, create: { userId, ...data }, update: data });
  }

  async create(userId: string, date: string): Promise<Probe> {
    return serializeCalendarMutation(userId, () => this.createLocked(userId, date));
  }

  private async createLocked(userId: string, date: string): Promise<Probe> {
    const parsedDate = new Date(`${date}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(parsedDate.getTime()) ||
        parsedDate.toISOString().slice(0, 10) !== date || date >= "9999-12-31") {
      throw new AppError("INVALID_DATE", 400, "Kies een geldige datum vanaf morgen voor de ochtendproef.");
    }
    const existing = await this.db.probe.findUnique({ where: { userId_date: { userId, date } } });
    const futureDate = date > localDate(this.now(), this.config.timeZone);
    if (!existing && !futureDate) throw new AppError("INVALID_DATE", 400, "Kies een geldige datum vanaf morgen voor de ochtendproef.");
    const calendar = await this.db.calendarSettings.findUnique({ where: { userId } });
    if (calendar?.calendarId !== this.config.calendarId) {
      throw new AppError("CALENDAR_NOT_CONFIRMED", 409, "Controleer en bevestig eerst de gekozen agenda.");
    }
    await this.verifyCalendar(userId);
    const id = randomUUID();
    const eventId = `p${randomUUID().replaceAll("-", "")}`;
    const request: CalendarEvent = {
      id: eventId,
      summary: "When2Watch — meldingsproef Slow Horses",
      description: "Proefitem voor When2Watch, geen echte aflevering. Gewenste melding: 09:00 Europe/Amsterdam op deze datum. Ontvangst in Apple Agenda en Google Agenda in Chrome moet nog afzonderlijk worden bevestigd.",
      start: { date }, end: { date: nextDate(date) }, reminders: { useDefault: true },
      extendedProperties: { private: { app: "when2watch", kind: "probe", userId, probeId: id } },
    };
    // Persist the ID before touching Google, so a lost response can be retried.
    const probe = await this.db.probe.upsert({
      where: { userId_date: { userId, date } }, update: {},
      create: { id, userId, calendarId: calendar.calendarId, eventId, date, requestJson: JSON.stringify(request) },
    });
    if (probe.calendarId !== calendar.calendarId) throw new AppError("WRONG_CALENDAR", 409, "Dit proefitem hoort bij een andere agenda.");
    if (probe.status === "deleted") throw new AppError("PROBE_ALREADY_REMOVED", 409, "Deze proef is opgeruimd. Kies een andere datum voor een nieuwe proef.");

    let event: CalendarEvent;
    try {
      event = await this.google.event(probe.calendarId, probe.eventId);
    } catch (error) {
      if (!(error instanceof AppError) || error.code !== "NOT_FOUND" || probe.status !== "prepared") throw error;
      if (!futureDate) throw new AppError("PROBE_DATE_PASSED", 409, "Google heeft geen proefitem op deze datum. Kies een nieuwe datum om de proef alsnog uit te voeren.");
      try { await this.google.insert(probe.calendarId, JSON.parse(probe.requestJson) as CalendarEvent); }
      catch (insertError) {
        if (!(insertError instanceof AppError) || insertError.code !== "CONFLICT") throw insertError;
      }
      event = await this.google.event(probe.calendarId, probe.eventId);
    }
    this.assertOwned(probe, event);
    if (event.status === "cancelled" || event.start?.date !== date || event.end?.date !== nextDate(date) || event.start.dateTime || event.end.dateTime) {
      throw new AppError("EVENT_CHANGED", 409, "Het proefitem is gewijzigd of verwijderd. Controleer het in de agenda.");
    }
    return this.db.probe.update({
      where: { id: probe.id }, data: { status: "created", readbackJson: JSON.stringify(safeEvent(event)) },
    });
  }

  async remove(userId: string, probeId: string): Promise<void> {
    return serializeCalendarMutation(userId, () => this.removeLocked(userId, probeId));
  }

  private async removeLocked(userId: string, probeId: string): Promise<void> {
    const probe = await this.db.probe.findFirst({ where: { id: probeId, userId } });
    if (!probe) throw new AppError("PROBE_NOT_FOUND", 404, "Dit proefitem hoort niet bij jouw account.");
    if (probe.status === "deleted") return;
    try {
      const event = await this.google.event(probe.calendarId, probe.eventId);
      if (event.status !== "cancelled") {
        this.assertOwned(probe, event);
        if (!event.etag) throw new AppError("EVENT_CHANGED", 409, "De versie van het proefitem ontbreekt. Probeer opnieuw.");
        await this.google.remove(probe.calendarId, probe.eventId, event.etag);
      }
    } catch (error) {
      if (!(error instanceof AppError) || !["NOT_FOUND", "GONE"].includes(error.code)) throw error;
    }
    await this.db.probe.update({ where: { id: probe.id }, data: { status: "deleted" } });
  }

  private assertOwned(probe: Probe, event: CalendarEvent): void {
    const marker = event.extendedProperties?.private;
    if (event.id !== probe.eventId || marker?.app !== "when2watch" || marker.kind !== "probe" || marker.userId !== probe.userId || marker.probeId !== probe.id) {
      throw new AppError("EVENT_NOT_OWNED", 409, "Dit agenda-item heeft niet de verwachte When2Watch-markering. Het wordt niet gewijzigd.");
    }
  }
}
