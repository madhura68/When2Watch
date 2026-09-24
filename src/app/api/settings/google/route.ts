import { currentSessionToken, requireUser } from "@/server/auth";
import { config } from "@/server/config";
import { database } from "@/server/db";
import { AppError, errorResponse } from "@/server/errors";
import { connectionCookie, GoogleConnectionService, type ConnectionMode } from "@/server/google-connection";
import { requireSameOrigin } from "@/server/http-guards";
import { publicInstallation } from "@/server/installation";

export const runtime = "nodejs";
export async function GET() {
  try { const user = await requireUser(); return Response.json(await publicInstallation(database(), user.id), { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return errorResponse(error); }
}
export async function POST(request: Request) {
  try {
    const user = await requireUser(); requireSameOrigin(request, config().origin);
    const input = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new AppError("INVALID_INPUT", 400, "Kies een Google-actie.");
    const service = new GoogleConnectionService(database()), token = await currentSessionToken();
    if (input.action === "confirm" || input.action === "cancel") {
      if (typeof input.id !== "string" || Object.keys(input).some(k => !["action", "id"].includes(k))) throw new AppError("INVALID_INPUT", 400, "Kies een geldige koppelpoging.");
      if (input.action === "confirm") return Response.json(await service.confirm(user.id, token, input.id));
      await service.cancel(input.id, token); return Response.json({ cancelled: true });
    }
    if (input.action !== "begin" || Object.keys(input).some(k => !["action", "mode", "clientId", "clientSecret"].includes(k))) throw new AppError("INVALID_INPUT", 400, "Kies een Google-actie.");
    const attempt = await service.begin(user.id, token, { mode: input.mode as ConnectionMode, clientId: input.clientId as string, clientSecret: input.clientSecret as string });
    return Response.json({ started: true }, { headers: { "Cache-Control": "private, no-store", "Set-Cookie": `${connectionCookie}=${attempt.id}; Path=/; HttpOnly; SameSite=Lax; Max-Age=900${config().origin.startsWith("https://") ? "; Secure" : ""}` } });
  } catch (error) { return errorResponse(error); }
}
