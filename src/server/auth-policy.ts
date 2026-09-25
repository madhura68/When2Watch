export const calendarScopes = [
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
  "https://www.googleapis.com/auth/calendar.events",
] as const;
export const calendarCreationScope = "https://www.googleapis.com/auth/calendar.app.created";

export function hasCalendarScopes(scope?: string | null): boolean {
  const granted = new Set(scope?.split(/\s+/));
  return calendarScopes.every((required) => granted.has(required));
}
