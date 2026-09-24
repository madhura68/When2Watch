import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { getInstallation } from "../src/server/installation";
import { getPreferences } from "../src/server/preferences";
import { GoogleCalendar } from "../src/server/google-calendar";
import { getGoogleAccessToken } from "../src/server/google-tokens";

async function main(){
  assert(process.argv.includes("--authorized-refresh-proof"));
  const db=new PrismaClient();
  try{
    const installation=await getInstallation(db); assert(installation?.ownerId && installation.activeAccountId);
    const user={id:installation.ownerId};
    const settings={...(await getPreferences(user.id,db)),calendarId:(await db.calendarSettings.findUniqueOrThrow({where:{userId:user.id}})).calendarId};
    const before=await db.account.findUniqueOrThrow({where:{id:installation.activeAccountId},select:{expires_at:true}});
    const token=await getGoogleAccessToken(db,installation.activeAccountId,undefined,true);
    const calendar=await new GoogleCalendar(async()=>token).calendar(settings.calendarId);
    const after=await db.account.findUniqueOrThrow({where:{id:installation.activeAccountId},select:{expires_at:true,needsReauth:true}});
    console.log(JSON.stringify({at:new Date().toISOString(),before,after,calendarConfirmed:calendar.id===settings.calendarId,interactiveLogin:false}));
  }finally{await db.$disconnect();}
}
main().catch(()=>{console.error("Token refresh proof failed; credentials were not printed.");process.exitCode=1;});
