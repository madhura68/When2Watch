import { AppError } from "./errors";

// Personal choices live in SQLite; only server basics come from the environment.
export function config() {
  if (!process.env.NEXTAUTH_URL?.trim() || !process.env.NEXTAUTH_SECRET?.trim()) throw new AppError("SETUP_REQUIRED", 503, "De serverconfiguratie is nog niet gereed.");
  const origin = new URL(process.env.NEXTAUTH_URL!).origin;
  if (process.env.NODE_ENV === "production" && !origin.startsWith("https://")) {
    throw new AppError("HTTPS_REQUIRED", 503, "De serverconfiguratie is nog niet gereed.");
  }
  return {
    origin,
    secret: process.env.NEXTAUTH_SECRET!,
    cronSecret: process.env.CRON_SECRET,
  };
}
