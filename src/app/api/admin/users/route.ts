import { config } from "@/server/config";
import { database } from "@/server/db";
import { AppError, errorResponse } from "@/server/errors";
import { requireSameOrigin } from "@/server/http-guards";
import { blockUser, listUsers, reactivateUser } from "@/server/admin-users";
import { requireAdmin } from "@/server/user-access";

export const runtime = "nodejs";
const noStore = { "Cache-Control": "private, no-store" };
export async function GET() {
  try { const admin = await requireAdmin(); return Response.json({ users: await listUsers(database(), admin.id) }, { headers: noStore }); }
  catch (error) { return errorResponse(error); }
}
export async function PATCH(request: Request) {
  try {
    const admin = await requireAdmin(); requireSameOrigin(request, config().origin);
    const body = await request.json().catch(() => null) as { userId?: unknown; action?: unknown } | null;
    if (typeof body?.userId !== "string" || !["block", "reactivate"].includes(body.action as string)) throw new AppError("INVALID_INPUT", 400, "Kies een gebruiker en een actie.");
    const result = body.action === "block" ? await blockUser(database(), admin.id, body.userId) : await reactivateUser(database(), admin.id, body.userId);
    return Response.json(result, { headers: noStore });
  } catch (error) { return errorResponse(error); }
}
