import { requireUser } from "@/server/user-access";
import { config } from "@/server/config";
import { AppError, errorResponse } from "@/server/errors";
import { requireSameOrigin } from "@/server/http-guards";
import { calendarSettingsService } from "@/server/services";

export const runtime = "nodejs";
/** Choose a provable app calendar; switching an existing destination needs an explicit acknowledgement. */
export async function POST(request: Request) {
  try {
    const user = await requireUser(); requireSameOrigin(request, config().origin);
    const input = await request.json().catch(() => null);
    if (!input || typeof input !== "object" || typeof input.calendarId !== "string" || Object.keys(input).some(k => !["calendarId", "switch", "acknowledgeOldItems"].includes(k))) throw new AppError("INVALID_INPUT", 400, "Kies de volledige agenda-ID.");
    const calendar = input.switch === true ? await calendarSettingsService().switchCalendar(user.id, input.calendarId, input.acknowledgeOldItems === true)
      : await calendarSettingsService().select(user.id, input.calendarId);
    return Response.json({ calendar }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return errorResponse(error); }
}
