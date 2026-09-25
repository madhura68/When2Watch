import type { PrismaClient } from "@prisma/client";
import { GoogleCalendar, type CalendarInfo } from "./google-calendar";
import { bindingMetadata, connectionAccount, getActiveBinding } from "./calendar-bindings";
import { accessFor } from "./user-access";
import { AppError } from "./errors";
import { serializeCalendarMutation } from "./calendar-mutations";
import { calendarCreationScope, hasCalendarScopes } from "./auth-policy";
import { validTimeZone } from "./preferences";

type CreateInput = { requestId: string; name: string; timeZone: string };
const unresolved = ["sending", "uncertain", "created", "ready"];
const uncertain = () => new AppError("CALENDAR_CREATION_UNCERTAIN", 409, "De aanmaak is nog niet bevestigd. Vernieuw de agendalijst en kies de bedoelde agenda; maak haar niet opnieuw aan.");

export class CalendarSettingsService {
  constructor(private readonly db: PrismaClient, private readonly google: (accountId: string) => GoogleCalendar) {}

  private async connection(userId: string, create = false) {
    await accessFor(this.db, userId);
    const account = await connectionAccount(this.db, userId);
    if (!account || account.userId !== userId || account.needsReauth || !account.refresh_token || !hasCalendarScopes(account.scope) ||
        (create && !account.scope?.split(/\s+/).includes(calendarCreationScope))) {
      throw new AppError("RECONNECT_GOOGLE", 409, create ? "Geef Google toestemming om een agenda aan te maken." : "Geef Google de benodigde agendatoestemmingen.");
    }
    return { account, google: this.google(account.id) };
  }

  list(userId: string) {
    return serializeCalendarMutation(userId, async () => (await this.connection(userId)).google.calendars());
  }

  select(userId: string, calendarId: string) {
    if (typeof calendarId !== "string" || !calendarId.trim() || calendarId.length > 1024 || calendarId === "primary") {
      throw new AppError("INVALID_INPUT", 400, "Kies een agenda uit de lijst met haar volledige ID.");
    }
    return serializeCalendarMutation(userId, async () => {
      const { account, google } = await this.connection(userId);
      const current = await getActiveBinding(this.db, userId);
      if ("binding" in current && current.binding.calendarId !== calendarId) throw new AppError("CALENDAR_TRANSITION_REQUIRED", 409, "Gebruik de agendawissel om bestaande afspraken veilig over te zetten.");
      const calendar = await google.calendar(calendarId);
      // Only a completed creation by this user and account proves app ownership; a name never does.
      const proven = await this.db.calendarCreationAttempt.findFirst({ where: { ownerId: userId, accountId: account.id, calendarId: calendar.id, status: { in: ["created", "ready", "selected"] } } });
      await this.db.$transaction(async tx => {
        const data = { accountId: account.id, status: "ACTIVE" as const, ...bindingMetadata(calendar) };
        const existing = await tx.calendarBinding.findUnique({ where: { userId_calendarId: { userId, calendarId: calendar.id } } });
        const provenance = proven || existing?.provenance === "APP_CREATED" ? "APP_CREATED" as const : "LEGACY_UNVERIFIED" as const;
        await tx.calendarBinding.upsert({ where: { userId_calendarId: { userId, calendarId: calendar.id } },
          create: { userId, calendarId: calendar.id, provenance, ...data }, update: { provenance, ...data } });
        await tx.calendarCreationAttempt.updateMany({ where: { ownerId: userId, status: { in: unresolved } }, data: { status: "selected" } });
      });
      return calendar;
    });
  }

  create(userId: string, input: CreateInput) {
    if (!input || typeof input.requestId !== "string" || !/^[a-zA-Z0-9-]{8,128}$/.test(input.requestId) ||
        typeof input.name !== "string" || !input.name.trim() || input.name.trim().length > 200 || !validTimeZone(input.timeZone)) {
      throw new AppError("INVALID_INPUT", 400, "Geef een agendanaam en een geldige tijdzone op.");
    }
    return serializeCalendarMutation(userId, async () => {
      const { account, google } = await this.connection(userId, true);
      const previous = await this.db.calendarCreationAttempt.findUnique({ where: { id: input.requestId } });
      if (previous) {
        if (previous.ownerId !== userId || previous.accountId !== account.id || previous.name !== input.name.trim() || previous.timeZone !== input.timeZone) {
          throw new AppError("INVALID_INPUT", 409, "Deze aanvraag hoort bij een andere keuze. Vernieuw eerst de instellingen.");
        }
        if (!["ready", "selected"].includes(previous.status) || !previous.calendarId) throw uncertain();
        return google.calendar(previous.calendarId);
      }
      if (await this.db.calendarCreationAttempt.count({ where: { ownerId: userId, status: { in: unresolved } } })) {
        throw new AppError("CALENDAR_CREATION_PENDING", 409, "Er staat al een agenda-aanvraag open. Vernieuw de lijst en kies eerst de bedoelde agenda.");
      }
      await this.db.calendarCreationAttempt.create({ data: { id: input.requestId, ownerId: userId, accountId: account.id, name: input.name.trim(), timeZone: input.timeZone } });
      let id: string;
      try {
        id = (await google.createCalendar(input.name.trim(), input.timeZone)).id;
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
      return calendar;
    });
  }
}
