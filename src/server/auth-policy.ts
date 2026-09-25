export const calendarListScope = "https://www.googleapis.com/auth/calendar.calendarlist.readonly";
export const calendarCreationScope = "https://www.googleapis.com/auth/calendar.app.created";
/** The only Calendar grants new connections request (IDEA-219): read the list, manage app-created calendars. */
export const calendarScopes = [calendarListScope, calendarCreationScope] as const;

/** Judged on the effectively granted scopes; an older broad grant alone does not qualify. */
export function hasCalendarScopes(scope?: string | null): boolean {
  const granted = new Set(scope?.split(/\s+/));
  return calendarScopes.every((required) => granted.has(required));
}
