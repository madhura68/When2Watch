import { config } from "@/server/config";
import { database } from "@/server/db";
import { errorResponse } from "@/server/errors";
import { rateLimit, requireSameOrigin } from "@/server/http-guards";
import { exchangeInvitation, invitationCookie, invitationCookieValue } from "@/server/invitations";

export const runtime = "nodejs";
// The token arrives in the POST body only (never in a path or query) and is never logged.
export async function POST(request: Request) {
  try {
    requireSameOrigin(request, config().origin);
    rateLimit(request, "invitation-exchange");
    const body = await request.json().catch(() => null) as { token?: unknown } | null;
    const flow = await exchangeInvitation(database(), body?.token);
    const secure = config().origin.startsWith("https://") ? "; Secure" : "";
    return Response.json({ ok: true }, { headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer",
      "Set-Cookie": `${invitationCookie}=${invitationCookieValue(flow)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=900${secure}` } });
  } catch (error) { return errorResponse(error); }
}
