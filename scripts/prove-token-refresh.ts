import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { getInstallation } from "../src/server/installation";
import { getPreferences } from "../src/server/preferences";
import { GoogleCalendar } from "../src/server/google-calendar";
import { getGoogleAccessToken } from "../src/server/google-tokens";
import { getActiveBinding } from "../src/server/calendar-bindings";

async function main(){
  assert(process.argv.includes("--authorized-refresh-proof"));
  const db=new PrismaClient();
  try{
    const installation=await getInstallation(db); assert(installation?.ownerId);
    const active=await getActiveBinding(db,installation.ownerId); assert("binding" in active,"The owner needs an own active calendar binding");
    const settings={...(await getPreferences(installation.ownerId,db)),calendarId:active.binding.calendarId};
    const before=await db.account.findUniqueOrThrow({where:{id:active.account.id},select:{expires_at:true}});
    const token=await getGoogleAccessToken(db,active.account.id,undefined,true);
    const calendar=await new GoogleCalendar(async()=>token).calendar(settings.calendarId);
    const after=await db.account.findUniqueOrThrow({where:{id:active.account.id},select:{expires_at:true,needsReauth:true}});
    console.log(JSON.stringify({at:new Date().toISOString(),before,after,calendarConfirmed:calendar.id===settings.calendarId,interactiveLogin:false}));
  }finally{await db.$disconnect();}
}
main().catch(()=>{console.error("Token refresh proof failed; credentials were not printed.");process.exitCode=1;});
