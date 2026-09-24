import { getInstallation } from "@/server/installation";
import { cronResponse } from "@/server/cron";
import { AppError } from "@/server/errors";
import { syncService } from "@/server/services";

export const runtime = "nodejs";
export async function POST(request: Request) {
  return cronResponse(request,process.env.CRON_SECRET,async()=>{
    const installation=await getInstallation();
    if(!installation?.ownerId)throw new AppError("CONNECT_GOOGLE",409,"Koppel eerst het toegelaten Google-account.");
    return syncService(installation.ownerId).sync(installation.ownerId,"cron");
  });
}
