import type { PrismaClient } from "@prisma/client";
import { getActiveBinding } from "./calendar-bindings";
import { getPreferences, type EventMode } from "./preferences";
import { normalizeTimeZone } from "@/lib/time-zone";
export type SyncSettings = { calendarId: string; timeZone: string; eventMode: EventMode; eventTime: string | null };
export async function loadSyncSettings(userId: string, db: PrismaClient): Promise<SyncSettings> {
  const [p, active] = await Promise.all([getPreferences(userId, db), getActiveBinding(db, userId)]);
  return { calendarId: "binding" in active ? active.binding.calendarId : "", timeZone: normalizeTimeZone(p.timeZone) ?? "Europe/Amsterdam", eventMode: p.eventMode === "FIXED_TIME" && p.eventTime ? "FIXED_TIME" : "ALL_DAY", eventTime: p.eventTime };
}
