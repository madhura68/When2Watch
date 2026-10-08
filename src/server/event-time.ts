// event-time.ts
const parts = (instant: Date, timeZone: string) => {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const p = Object.fromEntries(f.formatToParts(instant).map(x => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}:${p.second}` };
};
export function offsetMinutes(instant: Date, timeZone: string): number {
  const { date, time } = parts(instant, timeZone);
  return Math.round((Date.parse(`${date}T${time}Z`) - instant.getTime()) / 60_000);
}
const offsetString = (m: number) => `${m < 0 ? "-" : "+"}${String(Math.floor(Math.abs(m) / 60)).padStart(2, "0")}:${String(Math.abs(m) % 60).padStart(2, "0")}`;
export function resolveWallTime(date: string, time: string, timeZone: string): Date {
  const guess = Date.parse(`${date}T${time}:00Z`), day = 86_400_000;
  // Sample the offset a day before, at, and a day after the UTC reading of the wall time: that brackets the
  // transition for every zone (|offset| <= 14 h). A +/-3 h window misses it for zones far from UTC.
  const before = offsetMinutes(new Date(guess - day), timeZone);
  const offsets = [...new Set([before, offsetMinutes(new Date(guess), timeZone), offsetMinutes(new Date(guess + day), timeZone)])];
  const candidates = offsets.map(o => new Date(guess - o * 60_000))
    .filter(c => { const p = parts(c, timeZone); return p.date === date && p.time.slice(0, 5) === time; });
  if (candidates.length) return new Date(Math.min(...candidates.map(c => c.getTime())));   // overlap: earliest instant
  return new Date(guess - before * 60_000);                                                // gap: pre-transition offset = wall time shifted by the gap
}
export const formatInZone = (instant: Date, timeZone: string) => { const { date, time } = parts(instant, timeZone); return `${date}T${time}${offsetString(offsetMinutes(instant, timeZone))}`; };
export const localDateIn = (instant: Date, timeZone: string) => parts(instant, timeZone).date;
