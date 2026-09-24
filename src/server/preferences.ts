import type { PrismaClient } from "@prisma/client";
import { isAgendaMonths, type AgendaMonths } from "@/lib/agenda-range";
import { database } from "./db";
import { AppError } from "./errors";

export type Preferences = { agendaMonths: AgendaMonths; timeZone: string };

export async function getPreferences(userId: string, db: PrismaClient = database()): Promise<Preferences> {
  const value = await db.userPreferences.findUnique({ where: { userId } });
  return { agendaMonths: value && isAgendaMonths(value.agendaMonths) ? value.agendaMonths : 1, timeZone: value?.timeZone ?? "Europe/Amsterdam" };
}

export async function savePreferences(userId: string, patch: unknown, db?: PrismaClient): Promise<Preferences> {
  if (!patch || typeof patch !== "object" || Array.isArray(patch) || Object.keys(patch).length !== 1 || !("agendaMonths" in patch) || !isAgendaMonths(patch.agendaMonths)) {
    throw new AppError("INVALID_INPUT", 400, "Kies een periode van één, twee of drie maanden.");
  }
  const storage = db ?? database();
  await storage.userPreferences.upsert({ where: { userId }, create: { userId, agendaMonths: patch.agendaMonths }, update: { agendaMonths: patch.agendaMonths } });
  return getPreferences(userId, storage);
}
