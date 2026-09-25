import { requireUser } from "@/server/user-access";
import { database } from "@/server/db";
import { errorResponse } from "@/server/errors";
import { exportOwnData } from "@/server/privacy";

export const runtime = "nodejs";
/** Download of the signed-in user's own data; never tokens or other users. */
export async function GET() {
  try {
    const user = await requireUser();
    return new Response(JSON.stringify(await exportOwnData(database(), user.id), null, 2), { headers: { "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": 'attachment; filename="when2watch-export.json"', "Cache-Control": "private, no-store" } });
  } catch (error) { return errorResponse(error); }
}
