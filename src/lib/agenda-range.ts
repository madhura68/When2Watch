import { localDate } from "./dates";

export type AgendaMonths = 1 | 2 | 3;
export type AgendaWindow = { from: string; untilExclusive: string };

export function isAgendaMonths(value: unknown): value is AgendaMonths {
  return value === 1 || value === 2 || value === 3;
}

export function agendaWindow(now: Date, timeZone: string, months: AgendaMonths): AgendaWindow {
  const from = localDate(now, timeZone);
  const [year, month, day] = from.split("-").map(Number);
  const monthIndex = year * 12 + month - 1 + months;
  const endYear = Math.floor(monthIndex / 12), endMonth = monthIndex % 12;
  const lastDay = new Date(Date.UTC(endYear, endMonth + 1, 0)).getUTCDate();
  const untilExclusive = `${endYear}-${String(endMonth + 1).padStart(2, "0")}-${String(Math.min(day, lastDay)).padStart(2, "0")}`;
  return { from, untilExclusive };
}
