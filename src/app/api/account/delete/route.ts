import { requireUser } from "@/server/user-access";
import { config } from "@/server/config";
import { database } from "@/server/db";
import { AppError, errorResponse } from "@/server/errors";
import { requireSameOrigin } from "@/server/http-guards";
import { currentSessionToken } from "@/server/auth";
import { deleteOwnAccount } from "@/server/privacy";

export const runtime = "nodejs";
/** Deletes the signed-in user's own account; no admin or bulk variant exists. */
export async function POST(request: Request) {
  try {
    const user = await requireUser(); requireSameOrigin(request, config().origin);
    const input = await request.json().catch(() => null);
    if (!input || typeof input !== "object" || Object.keys(input).some(k => k !== "confirmation")) throw new AppError("INVALID_INPUT", 400, "Bevestig het verwijderen.");
    return Response.json(await deleteOwnAccount(database(), user.id, await currentSessionToken(), input.confirmation), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return errorResponse(error); }
}
