import { AppError } from "./errors";

export function requireSameOrigin(request: Request, origin: string): void {
  if (request.headers.get("origin") !== origin) {
    throw new AppError("INVALID_ORIGIN", 403, "This action must be started from When2Watch.");
  }
}

export async function stringField(request: Request, field: string): Promise<string> {
  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { throw new AppError("INVALID_INPUT", 400, "The input could not be read. Try again."); }
  if (!body || typeof body[field] !== "string" || (body[field] as string).length > 200) {
    throw new AppError("INVALID_INPUT", 400, "The input is missing or invalid.");
  }
  return body[field] as string;
}

// One Node process: an in-memory window is enough to bound unauthenticated endpoints.
const shared = globalThis as typeof globalThis & { when2watchRates?: Map<string, number[]> };
const hits = shared.when2watchRates ??= new Map<string, number[]>();
export function rateLimit(request: Request, bucket: string, limit = 10, windowMs = 10 * 60_000, now = Date.now()): void {
  const client = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "direct";
  const key = `${bucket}:${client}`, recent = (hits.get(key) ?? []).filter(time => time > now - windowMs);
  if (recent.length >= limit) throw new AppError("RATE_LIMITED", 429, "Too many attempts. Try again in a few minutes.");
  recent.push(now); hits.set(key, recent);
}
