import { requireUser } from "@/server/user-access";
import { config } from "@/server/config";
import { requireSameOrigin } from "@/server/http-guards";
import { probeService } from "@/server/services";
import { errorResponse } from "@/server/errors";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    requireSameOrigin(request, config().origin);
    const calendar = await probeService(user.id).verifyCalendar(user.id);
    return Response.json({ calendar }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return errorResponse(error); }
}
