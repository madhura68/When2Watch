import { getPreferences } from "./preferences";
import { database } from "./db";
import { localDate } from "@/lib/dates";
import type { PrismaClient } from "@prisma/client";
import { calendarEventHash, episodeEvent } from "./sync";
import { getActiveBinding } from "./calendar-bindings";

/** The user's own follows over the shared catalog; links only from the user's own active binding. */
export async function overview(userId: string, db: PrismaClient = database(), now = new Date(), timeZone?: string) {
  const zone = timeZone ?? (await getPreferences(userId, db)).timeZone;
  const today = localDate(now, zone);
  const active = await getActiveBinding(db, userId);
  const bindingId = "binding" in active ? active.binding.id : null;
  const [follows,lastRun] = await Promise.all([
    db.userFollow.findMany({
      where:{userId},
      include:{show:{include:{episodes:{where:{present:true},orderBy:[{airdate:"asc"},{sourceId:"asc"}],
        include:{links:{where:{bindingId:bindingId ?? "__none__",userId},select:{status:true,eventId:true,calendarId:true,confirmedDesiredHash:true}}}}}}},
    }),
    db.syncRun.findFirst({where:{userId},orderBy:{startedAt:"desc"},select:{status:true,startedAt:true,finishedAt:true}}),
  ]);
  const account = "binding" in active ? active.account : null;
  const calendar = "binding" in active ? {calendarId:active.binding.calendarId,summary:active.binding.summary ?? active.binding.calendarId,timeZone:active.binding.timeZone ?? zone} : null;
  return {calendar,timeZone:zone,needsReauth:!account?.refresh_token || account.needsReauth,
    lastRun: lastRun ? {status:lastRun.status,startedAt:lastRun.startedAt.toISOString(),finishedAt:lastRun.finishedAt?.toISOString()??null} : null,
    shows:follows.map(f=>({s:f.show,f})).sort((a,b)=>a.s.title.localeCompare(b.s.title)).map(({s,f})=>({id:s.tvmazeId,title:s.title,trying:f.trying,sourceUrl:s.sourceUrl,poster:s.poster,bannerUrl:s.bannerUrl,backgroundUrl:s.backgroundUrl,year:s.year,platform:s.platform,country:s.country,status:s.status,
      summaryText:s.summaryText,genres:JSON.parse(s.genresJson) as string[],runtimeMinutes:s.runtimeMinutes,
      lastAttempt:f.lastAttemptAt?.toISOString()??null,lastSuccess:f.lastSuccessAt?.toISOString()??null,error:f.lastError,
      upcoming:s.episodes.filter(e=>e.airdate && e.airdate>=today).map(e=>({id:e.sourceId,title:e.title,season:e.season,number:e.number,date:e.airdate!,
        summaryText:e.summaryText,sourceUrl:e.sourceUrl,
        linked:e.links.some(l=>l.calendarId===calendar?.calendarId && l.status==="synced" && l.confirmedDesiredHash===calendarEventHash(episodeEvent(userId,s,e,l.eventId)))})),
      unknownDates:s.episodes.filter(e=>!e.airdate).length,
    }))};
}
export type Overview = Awaited<ReturnType<typeof overview>>;
