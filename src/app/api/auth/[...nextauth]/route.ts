import NextAuth from "next-auth";
import type { NextRequest } from "next/server";
import { authOptions, sessionCookieName } from "@/server/auth";
import { errorResponse, AppError } from "@/server/errors";
import { database } from "@/server/db";
import { getInstallation } from "@/server/installation";
import { serializeCalendarMutation } from "@/server/calendar-mutations";
import { GoogleConnectionService, connectionCookie } from "@/server/google-connection";
import { invitationCookie } from "@/server/invitations";
import { config } from "@/server/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handler(request: NextRequest, context: { params: Promise<{ nextauth: string[] }> }) {
  try {
    const db = database(), installation = await getInstallation(db), { nextauth } = await context.params;
    if (!installation?.oauthClientConfigId) throw new AppError("SETUP_REQUIRED", 503, "Richt eerst de Google-koppeling van deze installatie in.");
    const action = nextauth[0], callback = action === "callback";
    const work = async () => {
      const attemptId = ["signin", "callback"].includes(action) ? request.cookies.get(connectionCookie)?.value : undefined;
      const sessionToken = request.cookies.get(sessionCookieName())?.value ?? "";
      // An open invitation flow is only honoured when no Calendar connection is in progress.
      const invitationValue = !attemptId && callback ? request.cookies.get(invitationCookie)?.value : undefined;
      const connections = new GoogleConnectionService(db);
      let response: Response;
      try {
        response = await NextAuth(await authOptions(attemptId ? { attemptId, sessionToken } : undefined,
          invitationValue ? { cookie: invitationValue, sessionToken } : undefined))(request, context);
        if (callback && attemptId && (await db.googleConnectionAttempt.findUnique({ where: { id: attemptId } }))?.status === "pending") {
          await connections.cancelLocked(attemptId, sessionToken);
          const headers = new Headers(response.headers);
          headers.set("Location", new URL("/settings?connection=failed", config().origin).href);
          response = new Response(null, { status: 303, headers });
        }
      } catch (error) {
        if (!(error instanceof AppError) || error.code !== "CONNECTION_EXPIRED") throw error;
        response = new Response(null, { status: 303, headers: { Location: new URL("/settings?connection=expired", config().origin).href } });
      }
      if (invitationValue) {
        response = new Response(response.body, response);
        response.headers.append("Set-Cookie", `${invitationCookie}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${config().origin.startsWith("https://") ? "; Secure" : ""}`);
      }
      if (attemptId && (callback || response.headers.get("location")?.includes("connection=expired"))) {
        response.headers.append("Set-Cookie", `${connectionCookie}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${config().origin.startsWith("https://") ? "; Secure" : ""}`);
      }
      return response;
    };
    // A Calendar connection runs under its own user's mutation lock; plain logins need none.
    const attemptId = ["signin", "callback"].includes(action) ? request.cookies.get(connectionCookie)?.value : undefined;
    const attemptOwner = attemptId ? (await db.googleConnectionAttempt.findUnique({ where: { id: attemptId }, select: { ownerId: true } }))?.ownerId : null;
    return attemptOwner ? await serializeCalendarMutation(attemptOwner, work) : await work();
  } catch (error) { return errorResponse(error); }
}

export { handler as GET, handler as POST };
