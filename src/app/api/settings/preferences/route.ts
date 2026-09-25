import { requireUser } from "@/server/user-access";
import { config } from "@/server/config";
import { AppError, errorResponse } from "@/server/errors";
import { requireSameOrigin } from "@/server/http-guards";
import { getPreferences, savePreferences } from "@/server/preferences";

export const runtime = "nodejs";
export async function GET() {
  try {
    const user = await requireUser();
    return Response.json(await getPreferences(user.id), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return errorResponse(error); }
}
export async function PATCH(request: Request) {
  try {
    const user = await requireUser(); requireSameOrigin(request, config().origin);
    let patch: unknown;
    try { patch = await request.json(); }
    catch { throw new AppError("INVALID_INPUT", 400, "De invoer is niet leesbaar. Probeer opnieuw."); }
    const preferences = await savePreferences(user.id, patch);
    return Response.json(preferences, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return errorResponse(error); }
}
