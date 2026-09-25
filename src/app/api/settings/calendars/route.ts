import { requireUser } from "@/server/user-access";
import { config } from "@/server/config";
import { AppError, errorResponse } from "@/server/errors";
import { requireSameOrigin } from "@/server/http-guards";
import { calendarSettingsService } from "@/server/services";

export const runtime = "nodejs";
export async function GET() {
  try { const user = await requireUser(); return Response.json({ calendars: await calendarSettingsService().list(user.id) }, { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return errorResponse(error); }
}
export async function POST(request: Request) {
  try {
    const user = await requireUser(); requireSameOrigin(request, config().origin);
    const input = await request.json().catch(() => null);
    if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).some(k => !["requestId", "name", "timeZone"].includes(k))) throw new AppError("INVALID_INPUT", 400, "Geef een naam en tijdzone voor de agenda op.");
    return Response.json({ calendar: await calendarSettingsService().create(user.id, input) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return errorResponse(error); }
}
