import { AppError } from "./errors";

// Personal choices live in the database; only server basics come from the environment.
export function config() {
  if (!process.env.NEXTAUTH_URL?.trim() || !process.env.NEXTAUTH_SECRET?.trim()) throw new AppError("SETUP_REQUIRED", 503, "The server configuration is not ready yet.");
  const origin = new URL(process.env.NEXTAUTH_URL!).origin;
  if (process.env.NODE_ENV === "production" && !origin.startsWith("https://")) {
    throw new AppError("HTTPS_REQUIRED", 503, "The server configuration is not ready yet.");
  }
  return {
    origin,
    secret: process.env.NEXTAUTH_SECRET!,
    cronSecret: process.env.CRON_SECRET,
  };
}
