import { requireUser } from "@/server/user-access";
import { config } from "@/server/config";
import { requireSameOrigin, stringField } from "@/server/http-guards";
import { probeService } from "@/server/services";
import { errorResponse } from "@/server/errors";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    requireSameOrigin(request, config().origin);
    const date = await stringField(request, "date");
    const probe = await probeService(user.id).create(user.id, date);
    return Response.json({ probe }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return errorResponse(error); }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireUser();
    requireSameOrigin(request, config().origin);
    const id = await stringField(request, "id");
    await probeService(user.id).remove(user.id, id);
    return Response.json({ removed: true });
  } catch (error) { return errorResponse(error); }
}
