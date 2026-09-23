import { AppError } from "./errors";

export const calendarScopes = [
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
  "https://www.googleapis.com/auth/calendar.events",
] as const;

export function hasCalendarScopes(scope?: string | null): boolean {
  const granted = new Set(scope?.split(/\s+/));
  return calendarScopes.every((required) => granted.has(required));
}

export function isAllowedGoogleSignIn(
  account: { provider?: string; scope?: string } | null,
  profile: { email?: string; email_verified?: boolean } | undefined,
  allowedEmail: string,
): boolean {
  return Boolean(
    allowedEmail.trim() && account?.provider === "google" &&
    profile?.email_verified === true &&
    profile.email?.trim().toLowerCase() === allowedEmail.trim().toLowerCase() &&
    hasCalendarScopes(account.scope),
  );
}

export function requireIdentity(
  session: { user?: { id?: string; email?: string | null } } | null,
  allowedEmail: string,
): { id: string; email: string } {
  const user = session?.user;
  if (!user?.id || !user.email || !allowedEmail.trim() ||
      user.email.trim().toLowerCase() !== allowedEmail.trim().toLowerCase()) {
    throw new AppError("UNAUTHORIZED", 401, "Log in met het toegelaten Google-account.");
  }
  return { id: user.id, email: user.email };
}
