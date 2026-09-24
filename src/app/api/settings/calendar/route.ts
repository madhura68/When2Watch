import { requireUser } from "@/server/auth";
import { config } from "@/server/config";
import { AppError, errorResponse } from "@/server/errors";
import { requireSameOrigin } from "@/server/http-guards";
import { calendarSettingsService } from "@/server/services";

export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const user = await requireUser(); requireSameOrigin(request, config().origin);
    const input = await request.json().catch(() => null);
    if (!input || typeof input !== "object" || Object.keys(input).length !== 1 || typeof input.calendarId !== "string") throw new AppError("INVALID_INPUT", 400, "Kies de volledige agenda-ID.");
    return Response.json({ calendar: await calendarSettingsService().select(user.id, input.calendarId) });
  } catch (error) { return errorResponse(error); }
}
