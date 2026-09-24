import { config } from "@/server/config";
import { database } from "@/server/db";
import { cronResponse } from "@/server/cron";
import { AppError } from "@/server/errors";
import { syncService } from "@/server/services";

export const runtime = "nodejs";
export async function POST(request: Request) {
  return cronResponse(request,process.env.CRON_SECRET,async()=>{
    const user=await database().user.findUnique({where:{email:config().allowedEmail},select:{id:true}});
    if(!user)throw new AppError("CONNECT_GOOGLE",409,"Koppel eerst het toegelaten Google-account.");
    return syncService(user.id).sync(user.id,"cron");
  });
}
