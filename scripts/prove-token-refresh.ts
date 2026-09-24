import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { config } from "../src/server/config";
import { GoogleCalendar } from "../src/server/google-calendar";
import { getGoogleAccessToken, googleTokenRefresher } from "../src/server/google-tokens";

async function main(){
  assert(process.argv.includes("--authorized-refresh-proof"));
  const settings=config(),db=new PrismaClient();
  try{
    const user=await db.user.findUniqueOrThrow({where:{email:settings.allowedEmail},select:{id:true}});
    const before=await db.account.findFirstOrThrow({where:{userId:user.id,provider:"google"},select:{expires_at:true}});
    const token=await getGoogleAccessToken(db,user.id,googleTokenRefresher(settings.clientId,settings.clientSecret),true);
    const calendar=await new GoogleCalendar(async()=>token).calendar(settings.calendarId);
    const after=await db.account.findFirstOrThrow({where:{userId:user.id,provider:"google"},select:{expires_at:true,needsReauth:true}});
    console.log(JSON.stringify({at:new Date().toISOString(),before,after,calendarConfirmed:calendar.id===settings.calendarId,interactiveLogin:false}));
  }finally{await db.$disconnect();}
}
main().catch(()=>{console.error("Token refresh proof failed; credentials were not printed.");process.exitCode=1;});
