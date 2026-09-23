import { AppError } from "./errors";

export function requireSameOrigin(request: Request, origin: string): void {
  if (request.headers.get("origin") !== origin) {
    throw new AppError("INVALID_ORIGIN", 403, "Deze actie moet vanuit When2Watch worden gestart.");
  }
}

export async function stringField(request: Request, field: string): Promise<string> {
  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { throw new AppError("INVALID_INPUT", 400, "De invoer is niet leesbaar. Probeer opnieuw."); }
  if (!body || typeof body[field] !== "string" || (body[field] as string).length > 200) {
    throw new AppError("INVALID_INPUT", 400, "De invoer ontbreekt of is ongeldig.");
  }
  return body[field] as string;
}
