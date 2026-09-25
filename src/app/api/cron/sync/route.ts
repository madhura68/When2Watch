import { getInstallation } from "@/server/installation";
import { cronResponse } from "@/server/cron";
import { AppError } from "@/server/errors";
import { syncService } from "@/server/services";
import { database } from "@/server/db";

export const runtime = "nodejs";
export async function POST(request: Request) {
  return cronResponse(request,process.env.CRON_SECRET,async()=>{
    // Per-user scheduling follows in P8; until then only an ACTIVE installation owner is synced.
    const installation=await getInstallation();
    const owner=installation?.ownerId?await database().user.findUnique({where:{id:installation.ownerId},select:{accessStatus:true}}):null;
    if(!installation?.ownerId||owner?.accessStatus!=="ACTIVE")throw new AppError("CONNECT_GOOGLE",409,"Er is geen actieve gebruiker om te synchroniseren.");
    return syncService(installation.ownerId).sync(installation.ownerId,"cron");
  });
}
