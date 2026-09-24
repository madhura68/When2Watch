import { AppError } from "./errors";

export const calendarScopes = [
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
  "https://www.googleapis.com/auth/calendar.events",
] as const;
export const calendarCreationScope = "https://www.googleapis.com/auth/calendar.app.created";

export function hasCalendarScopes(scope?: string | null): boolean {
  const granted = new Set(scope?.split(/\s+/));
  return calendarScopes.every((required) => granted.has(required));
}

export function isAllowedGoogleSignIn(
  account: { provider?: string; providerAccountId?: string; scope?: string } | null,
  profile: { email?: string; email_verified?: boolean } | undefined,
  activeSubject: string,
): boolean {
  return Boolean(
    activeSubject && account?.provider === "google" &&
    profile?.email_verified === true && profile.email?.trim() &&
    account.providerAccountId === activeSubject,
  );
}

export function requireIdentity(
  session: { user?: { id?: string; email?: string | null } } | null,
  ownerId: string,
): { id: string; email: string } {
  const user = session?.user;
  if (!ownerId || !user?.id || !user.email || user.id !== ownerId) {
    throw new AppError("UNAUTHORIZED", 401, "Log in als eigenaar van deze installatie.");
  }
  return { id: user.id, email: user.email };
}
