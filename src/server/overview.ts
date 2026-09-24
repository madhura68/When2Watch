import { database } from "./db";
import { localDate } from "@/lib/dates";
import type { PrismaClient } from "@prisma/client";
import { calendarEventHash, episodeEvent } from "./sync";

export async function overview(userId: string, db: PrismaClient = database(), now = new Date()) {
  const today = localDate(now);
  const [shows,calendar,lastRun,account] = await Promise.all([
    db.trackedShow.findMany({
      where:{userId},orderBy:{title:"asc"},
      include:{episodes:{where:{present:true},orderBy:[{airdate:"asc"},{sourceId:"asc"}],include:{links:{select:{status:true,eventId:true,confirmedDesiredHash:true}}}}},
    }),
    db.calendarSettings.findUnique({where:{userId},select:{summary:true,timeZone:true}}),
    db.syncRun.findFirst({where:{userId},orderBy:{startedAt:"desc"},select:{status:true,startedAt:true,finishedAt:true}}),
    db.account.findFirst({where:{userId,provider:"google"},select:{needsReauth:true,refresh_token:true}}),
  ]);
  return {calendar,needsReauth:!account?.refresh_token || account.needsReauth,
    lastRun: lastRun ? {status:lastRun.status,startedAt:lastRun.startedAt.toISOString(),finishedAt:lastRun.finishedAt?.toISOString()??null} : null,
    shows:shows.map(s=>({id:s.tvmazeId,title:s.title,sourceUrl:s.sourceUrl,poster:s.poster,year:s.year,platform:s.platform,country:s.country,status:s.status,
      lastAttempt:s.lastAttemptAt?.toISOString()??null,lastSuccess:s.lastSuccessAt?.toISOString()??null,error:s.lastError,
      upcoming:s.episodes.filter(e=>e.airdate && e.airdate>=today).map(e=>({id:e.sourceId,title:e.title,season:e.season,number:e.number,date:e.airdate!,
        linked:e.links.some(l=>l.status==="synced" && l.confirmedDesiredHash===calendarEventHash(episodeEvent(userId,s,e,l.eventId)))})),
      unknownDates:s.episodes.filter(e=>!e.airdate).length,
    }))};
}
export type Overview = Awaited<ReturnType<typeof overview>>;
