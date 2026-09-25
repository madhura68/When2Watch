import { requireUser } from "@/server/user-access";
import { config } from "@/server/config";
import { AppError, errorResponse } from "@/server/errors";
import { requireSameOrigin } from "@/server/http-guards";
import { calendarSettingsService } from "@/server/services";

export const runtime = "nodejs";
const noStore = { "Cache-Control": "private, no-store" };
/** Without ?name: the usable app calendars. With ?name: same-named calendars from the complete list, reusable or not. */
export async function GET(request: Request) {
  try {
    const user = await requireUser(), name = new URL(request.url).searchParams.get("name");
    return Response.json(name === null ? { calendars: await calendarSettingsService().list(user.id) } : { matches: await calendarSettingsService().nameMatches(user.id, name) }, { headers: noStore });
  } catch (error) { return errorResponse(error); }
}
export async function POST(request: Request) {
  try {
    const user = await requireUser(); requireSameOrigin(request, config().origin);
    const input = await request.json().catch(() => null);
    if (input && typeof input === "object" && input.action === "abandon" && typeof input.requestId === "string") {
      return Response.json(await calendarSettingsService().abandonCreation(user.id, input.requestId), { headers: noStore });
    }
    if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).some(k => !["requestId", "name", "timeZone"].includes(k))) throw new AppError("INVALID_INPUT", 400, "Geef een naam en tijdzone voor de agenda op.");
    return Response.json({ calendar: await calendarSettingsService().create(user.id, input) }, { headers: noStore });
  } catch (error) { return errorResponse(error); }
}
