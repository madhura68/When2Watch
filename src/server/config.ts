import { AppError } from "./errors";

export const timeZone = "Europe/Amsterdam";

export function oauthReady(): boolean {
  return ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "NEXTAUTH_SECRET", "NEXTAUTH_URL", "ALLOWED_GOOGLE_EMAIL", "GOOGLE_CALENDAR_ID"]
    .every((key) => Boolean(process.env[key]?.trim()));
}

export function config() {
  if (!oauthReady()) throw new AppError("SETUP_REQUIRED", 503, "De Google-koppeling wordt nog ingericht.");
  const origin = new URL(process.env.NEXTAUTH_URL!).origin;
  if (process.env.NODE_ENV === "production" && !origin.startsWith("https://")) {
    throw new AppError("HTTPS_REQUIRED", 503, "De serverconfiguratie is nog niet gereed.");
  }
  return {
    origin,
    secret: process.env.NEXTAUTH_SECRET!,
    clientId: process.env.GOOGLE_CLIENT_ID!,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    allowedEmail: process.env.ALLOWED_GOOGLE_EMAIL!.trim().toLowerCase(),
    calendarId: process.env.GOOGLE_CALENDAR_ID!.trim(),
    timeZone,
  };
}
