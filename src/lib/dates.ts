export function localDate(now: Date, timeZone = "Europe/Amsterdam"): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const part = (type: string) => parts.find((value) => value.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function nextDate(date: string): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString().slice(0, 10);
}

/** Calendar dates use a synthetic UTC noon, never the viewer's time zone. */
export const formatEpisodeDate = (date: string): string => new Date(`${date}T12:00:00Z`).toLocaleDateString("en-GB", {timeZone: "UTC", day: "numeric", month: "long"});
export const formatDayLabel = (date: string, weekday = false): string => new Date(`${date}T12:00:00Z`).toLocaleDateString("en-GB", {timeZone: "UTC", ...(weekday ? {weekday: "long" as const} : {}), day: "numeric", month: "long", year: "numeric"});
