import { database } from "@/server/db";
import { errorResponse } from "@/server/errors";
import { adminStats } from "@/server/admin-stats";
import { requireAdmin } from "@/server/user-access";

export const runtime = "nodejs";
export async function GET() {
  try { const admin = await requireAdmin(); return Response.json(await adminStats(database(), admin.id), { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return errorResponse(error); }
}
