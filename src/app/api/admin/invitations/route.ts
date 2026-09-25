import { config } from "@/server/config";
import { database } from "@/server/db";
import { AppError, errorResponse } from "@/server/errors";
import { requireSameOrigin } from "@/server/http-guards";
import { createInvitation, listInvitations, revokeInvitation } from "@/server/invitations";
import { requireAdmin } from "@/server/user-access";

export const runtime = "nodejs";
const noStore = { "Cache-Control": "private, no-store" };
export async function GET() {
  try { const admin = await requireAdmin(); return Response.json({ invitations: await listInvitations(database(), admin.id) }, { headers: noStore }); }
  catch (error) { return errorResponse(error); }
}
export async function POST(request: Request) {
  try {
    const admin = await requireAdmin(); requireSameOrigin(request, config().origin);
    const body = await request.json().catch(() => null) as { email?: unknown } | null;
    const { invitation, path } = await createInvitation(database(), admin.id, body?.email);
    // Shown once to the admin to share personally; only its hash is stored.
    return Response.json({ id: invitation.id, link: `${config().origin}${path}`, expiresAt: invitation.expiresAt.toISOString() }, { headers: noStore });
  } catch (error) { return errorResponse(error); }
}
export async function DELETE(request: Request) {
  try {
    const admin = await requireAdmin(); requireSameOrigin(request, config().origin);
    const body = await request.json().catch(() => null) as { id?: unknown } | null;
    if (typeof body?.id !== "string") throw new AppError("INVALID_INPUT", 400, "Kies een uitnodiging.");
    return Response.json(await revokeInvitation(database(), admin.id, body.id), { headers: noStore });
  } catch (error) { return errorResponse(error); }
}
