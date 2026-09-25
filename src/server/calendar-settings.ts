import type { PrismaClient } from "@prisma/client";
import { GoogleCalendar, type CalendarInfo } from "./google-calendar";
import { AppError } from "./errors";
import { serializeCalendarMutation } from "./calendar-mutations";
import { hasCalendarScopes } from "./auth-policy";
import { validTimeZone } from "./preferences";
import { bindingMetadata, connectionAccount, getActiveBinding } from "./calendar-bindings";
import { accessFor } from "./user-access";

type CreateInput = { requestId: string; name: string; timeZone: string };
const unresolved = ["sending", "uncertain", "created", "ready"], proven = ["created", "ready", "selected"];
const uncertain = () => new AppError("CALENDAR_CREATION_UNCERTAIN", 409, "De aanmaak is nog niet bevestigd. Vernieuw de lijst en kies de bedoelde agenda; maak haar niet opnieuw aan.");

/** Trim, Unicode NFC and single spaces; 1–100 characters. */
export function normalizeCalendarName(name: unknown) {
  const value = typeof name === "string" ? name.normalize("NFC").trim().replace(/\s+/g, " ") : "";
  if (!value || value.length > 100) throw new AppError("INVALID_INPUT", 400, "Geef de agenda een naam van 1 tot 100 tekens.");
  return value;
}
const sameName = (a: string, b: string) => a.normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase() === b.toLowerCase();

export class CalendarSettingsService {
  constructor(private readonly db: PrismaClient, private readonly google: (accountId: string) => GoogleCalendar) {}

  private async connection(userId: string) {
    await accessFor(this.db, userId);
    const account = await connectionAccount(this.db, userId);
    if (!account || account.userId !== userId || account.needsReauth || !account.refresh_token || !hasCalendarScopes(account.scope)) {
      throw new AppError("RECONNECT_GOOGLE", 409, "Geef Google toestemming om je agendalijst te lezen en een When2Watch-agenda te beheren.");
    }
    return { account, google: this.google(account.id) };
  }

  /** Only a completed creation by this user and account (or an existing app binding) proves app ownership; a name never does. */
  private async provenCalendarIds(userId: string, accountId: string) {
    const [creations, bindings] = await Promise.all([
      this.db.calendarCreationAttempt.findMany({ where: { ownerId: userId, accountId, status: { in: proven }, calendarId: { not: null } }, select: { calendarId: true } }),
      this.db.calendarBinding.findMany({ where: { userId, accountId, provenance: "APP_CREATED" }, select: { calendarId: true } }),
    ]);
    return new Set([...creations.map(c => c.calendarId!), ...bindings.map(b => b.calendarId)]);
  }

  /** Same-named calendars in the complete, paginated list; only provable app calendars may be reused. */
  nameMatches(userId: string, name: unknown) {
    const wanted = normalizeCalendarName(name).toLowerCase();
    return serializeCalendarMutation(userId, async () => {
      const { account, google } = await this.connection(userId), ids = await this.provenCalendarIds(userId, account.id);
      return (await google.allCalendars()).filter(c => sameName(c.summary, wanted)).map(c => ({ id: c.id, summary: c.summary, reusable: ids.has(c.id) }));
    });
  }

  /** Calendars When2Watch may use: the provable app calendars of this account. */
  list(userId: string) {
    return serializeCalendarMutation(userId, async () => {
      const { account, google } = await this.connection(userId), ids = await this.provenCalendarIds(userId, account.id);
      const usable: CalendarInfo[] = [];
      for (const id of ids) { try { usable.push(await google.calendar(id)); } catch (error) { if (!(error instanceof AppError && [403, 404].includes(error.status))) throw error; } }
      return usable;
    });
  }

  private async activate(userId: string, accountId: string, calendar: CalendarInfo, replacing: string | null) {
    await this.db.$transaction(async tx => {
      // The previous calendar stays as inactive history with all its links; nothing is moved or deleted.
      if (replacing) await tx.calendarBinding.update({ where: { id: replacing }, data: { status: "INACTIVE" } });
      const data = { accountId, status: "ACTIVE" as const, provenance: "APP_CREATED" as const, ...bindingMetadata(calendar) };
      await tx.calendarBinding.upsert({ where: { userId_calendarId: { userId, calendarId: calendar.id } }, create: { userId, calendarId: calendar.id, ...data }, update: data });
      await tx.calendarCreationAttempt.updateMany({ where: { ownerId: userId, status: { in: unresolved }, calendarId: calendar.id }, data: { status: "selected" } });
    });
  }

  /** Choose (or re-read after a rename) a provable app calendar as the first destination. */
  select(userId: string, calendarId: string) {
    if (typeof calendarId !== "string" || !calendarId.trim() || calendarId.length > 1024 || calendarId === "primary") {
      throw new AppError("INVALID_INPUT", 400, "Kies een agenda uit de lijst met haar volledige ID.");
    }
    return serializeCalendarMutation(userId, async () => {
      const { account, google } = await this.connection(userId);
      if (!(await this.provenCalendarIds(userId, account.id)).has(calendarId)) {
        throw new AppError("NOT_APP_CALENDAR", 409, "When2Watch kan alleen een agenda gebruiken die het zelf heeft aangemaakt. Maak een nieuwe When2Watch-agenda.");
      }
      const current = await getActiveBinding(this.db, userId);
      if ("binding" in current && current.binding.calendarId !== calendarId) throw new AppError("CALENDAR_TRANSITION_REQUIRED", 409, "Gebruik de agendawissel; je bestaande afspraken blijven dan in de oude agenda staan.");
      const calendar = await google.calendar(calendarId);
      await this.activate(userId, account.id, calendar, null);
      return calendar;
    });
  }

  /** Explicit move of the destination to a new app calendar; the user must acknowledge that old items stay behind. */
  async switchCalendar(userId: string, calendarId: string, acknowledgeOldItems: boolean) {
    if (acknowledgeOldItems !== true) throw new AppError("ACKNOWLEDGEMENT_REQUIRED", 400, "Bevestig dat bestaande afspraken in de oude agenda blijven staan en dubbel zichtbaar kunnen zijn.");
    return serializeCalendarMutation(userId, async () => {
      const { account, google } = await this.connection(userId);
      if (!(await this.provenCalendarIds(userId, account.id)).has(calendarId)) throw new AppError("NOT_APP_CALENDAR", 409, "Kies een agenda die When2Watch zelf heeft aangemaakt.");
      const current = await getActiveBinding(this.db, userId);
      const calendar = await google.calendar(calendarId);
      await this.activate(userId, account.id, calendar, "binding" in current && current.binding.calendarId !== calendarId ? current.binding.id : null);
      return calendar;
    }, true);
  }

  /** Releases an unconfirmed creation so a new one (with another name) can start; nothing is bound. */
  abandonCreation(userId: string, requestId: string) {
    return serializeCalendarMutation(userId, async () => {
      const released = await this.db.calendarCreationAttempt.updateMany({ where: { id: requestId, ownerId: userId, status: { in: ["sending", "uncertain"] } }, data: { status: "abandoned" } });
      if (!released.count) throw new AppError("NOT_FOUND", 404, "Er staat geen onbevestigde aanvraag open.");
      return { abandoned: true };
    });
  }

  create(userId: string, input: CreateInput) {
    const name = normalizeCalendarName(input?.name);
    if (!input || typeof input.requestId !== "string" || !/^[a-zA-Z0-9-]{8,128}$/.test(input.requestId) || !validTimeZone(input.timeZone)) {
      throw new AppError("INVALID_INPUT", 400, "Geef een agendanaam en een geldige tijdzone op.");
    }
    return serializeCalendarMutation(userId, async () => {
      const { account, google } = await this.connection(userId);
      const previous = await this.db.calendarCreationAttempt.findUnique({ where: { id: input.requestId } });
      if (previous) {
        if (previous.ownerId !== userId || previous.accountId !== account.id || previous.name !== name || previous.timeZone !== input.timeZone) {
          throw new AppError("INVALID_INPUT", 409, "Deze aanvraag hoort bij een andere keuze. Vernieuw eerst de instellingen.");
        }
        if (!["ready", "selected"].includes(previous.status) || !previous.calendarId) throw uncertain();
        return google.calendar(previous.calendarId);
      }
      if (await this.db.calendarCreationAttempt.count({ where: { ownerId: userId, status: { in: ["sending", "uncertain"] } } })) {
        throw new AppError("CALENDAR_CREATION_PENDING", 409, "Er staat al een onbevestigde agenda-aanvraag open. Vernieuw de lijst en kies de bedoelde agenda.");
      }
      const ids = await this.provenCalendarIds(userId, account.id);
      const namesake = (await google.allCalendars()).filter(c => sameName(c.summary, name.toLowerCase()));
      if (namesake.some(c => !ids.has(c.id))) throw new AppError("NAME_TAKEN", 409, `Er bestaat al een agenda “${name}” die When2Watch niet heeft aangemaakt. Kies een andere naam, bijvoorbeeld “${name} 2”.`);
      if (namesake.length) throw new AppError("NAME_REUSABLE", 409, "Je hebt al een When2Watch-agenda met deze naam. Kies die in de lijst.");
      // Persist intent before POST; a lost answer is never repeated nor matched on name.
      await this.db.calendarCreationAttempt.create({ data: { id: input.requestId, ownerId: userId, accountId: account.id, name, timeZone: input.timeZone } });
      let id: string;
      try {
        id = (await google.createCalendar(name, input.timeZone)).id;
      } catch (error) {
        const rejected = error instanceof AppError && [400, 401, 403, 404].includes(error.status);
        await this.db.calendarCreationAttempt.update({ where: { id: input.requestId }, data: { status: rejected ? "rejected" : "uncertain" } });
        if (rejected) throw error;
        throw uncertain();
      }
      await this.db.calendarCreationAttempt.update({ where: { id: input.requestId }, data: { status: "created", calendarId: id } });
      const calendar = await google.calendar(id);
      if (calendar.timeZone !== input.timeZone) throw new AppError("CALENDAR_TIMEZONE", 409, "De nieuwe agenda heeft een andere tijdzone. Controleer haar in de lijst.");
      await this.db.calendarCreationAttempt.update({ where: { id: input.requestId }, data: { status: "ready" } });
      // First destination: bind right away. With an existing (legacy) destination the user switches explicitly.
      if (!("binding" in await getActiveBinding(this.db, userId))) await this.activate(userId, account.id, calendar, null);
      return calendar;
    });
  }
}
