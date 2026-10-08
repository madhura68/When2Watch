import type { PrismaClient } from "@prisma/client";
import { isAgendaMonths, type AgendaMonths } from "@/lib/agenda-range";
import { EVENT_TIME, normalizeTimeZone } from "@/lib/time-zone";
import { database } from "./db";
import { AppError } from "./errors";
import { serializeCalendarMutation } from "./calendar-mutations";
export { EVENT_TIME, normalizeTimeZone, validTimeZone } from "@/lib/time-zone";
export type EventMode = "ALL_DAY" | "FIXED_TIME";
export type Preferences = { agendaMonths: AgendaMonths; timeZone: string; eventMode: EventMode; eventTime: string | null };
export async function getPreferences(userId: string, db: PrismaClient = database()): Promise<Preferences> {
  const value = await db.userPreferences.findUnique({ where: { userId } });
  return { agendaMonths: value && isAgendaMonths(value.agendaMonths) ? value.agendaMonths : 1, timeZone: value?.timeZone ?? "Europe/Amsterdam", eventMode: value?.eventMode ?? "ALL_DAY", eventTime: value?.eventTime ?? null };
}
const invalid = () => new AppError("INVALID_INPUT", 400, "Choose a period of one, two or three months, a valid IANA time zone, and a time (HH:MM) for fixed-time events.");
export async function savePreferences(userId: string, patch: unknown, db?: PrismaClient): Promise<Preferences> {
  if (!patch || typeof patch !== "object" || Array.isArray(patch) || !Object.keys(patch).length ||
      Object.keys(patch).some(key => !["agendaMonths", "timeZone", "eventMode", "eventTime"].includes(key)) ||
      ("agendaMonths" in patch && !isAgendaMonths(patch.agendaMonths)) ||
      ("timeZone" in patch && !normalizeTimeZone(patch.timeZone)) ||
      ("eventMode" in patch && patch.eventMode !== "ALL_DAY" && patch.eventMode !== "FIXED_TIME") ||
      ("eventTime" in patch && patch.eventTime !== null && (typeof patch.eventTime !== "string" || !EVENT_TIME.test(patch.eventTime)))) throw invalid();
  const storage = db ?? database();
  return serializeCalendarMutation(userId, async () => {
    const merged = { ...await getPreferences(userId, storage), ...patch as Partial<Preferences> };
    const zone = normalizeTimeZone(merged.timeZone);
    if (!zone || (merged.eventMode === "FIXED_TIME" && !merged.eventTime)) throw invalid();
    const data = { ...merged, timeZone: zone };
    await storage.userPreferences.upsert({ where: { userId }, create: { userId, ...data }, update: data });
    return getPreferences(userId, storage);
  });
}
