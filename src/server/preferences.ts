import type { PrismaClient } from "@prisma/client";
import { isAgendaMonths, type AgendaMonths } from "@/lib/agenda-range";
import { database } from "./db";
import { AppError } from "./errors";
import { serializeCalendarMutation } from "./calendar-mutations";

export type Preferences = { agendaMonths: AgendaMonths; timeZone: string };

export function validTimeZone(value: unknown): value is string {
  if (typeof value !== "string" || !value || value.length > 100 || value !== value.trim()) return false;
  try { new Intl.DateTimeFormat("en", { timeZone: value }); return true; } catch { return false; }
}

export async function getPreferences(userId: string, db: PrismaClient = database()): Promise<Preferences> {
  const value = await db.userPreferences.findUnique({ where: { userId } });
  return { agendaMonths: value && isAgendaMonths(value.agendaMonths) ? value.agendaMonths : 1, timeZone: value?.timeZone ?? "Europe/Amsterdam" };
}

export async function savePreferences(userId: string, patch: unknown, db?: PrismaClient): Promise<Preferences> {
  if (!patch || typeof patch !== "object" || Array.isArray(patch) || !Object.keys(patch).length ||
      Object.keys(patch).some(key => !["agendaMonths", "timeZone"].includes(key)) ||
      ("agendaMonths" in patch && !isAgendaMonths(patch.agendaMonths)) || ("timeZone" in patch && !validTimeZone(patch.timeZone))) {
    throw new AppError("INVALID_INPUT", 400, "Kies een periode van één, twee of drie maanden en een geldige tijdzone.");
  }
  const storage = db ?? database();
  const data = patch as Partial<Preferences>;
  return serializeCalendarMutation(userId, async () => {
    await storage.userPreferences.upsert({ where: { userId }, create: { userId, ...data }, update: data });
    return getPreferences(userId, storage);
  });
}
