import { cronResponse, runScheduledSync } from "@/server/cron";
import { database } from "@/server/db";
import { syncService } from "@/server/services";
import { TVmaze } from "@/server/tvmaze";

export const runtime = "nodejs";
export async function POST(request: Request) {
  return cronResponse(request, process.env.CRON_SECRET, () => runScheduledSync(database(), new TVmaze(), syncService));
}
