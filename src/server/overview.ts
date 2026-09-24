import { getPreferences } from "./preferences";
import { database } from "./db";
import { localDate } from "@/lib/dates";
import type { PrismaClient } from "@prisma/client";
import { calendarEventHash, episodeEvent } from "./sync";

export async function overview(userId: string, db: PrismaClient = database(), now = new Date(), timeZone?: string) {
  const zone = timeZone ?? (await getPreferences(userId, db)).timeZone;
  const today = localDate(now, zone);
  const [shows,calendar,lastRun,installation] = await Promise.all([
    db.trackedShow.findMany({
      where:{userId},orderBy:{title:"asc"},
      include:{episodes:{where:{present:true},orderBy:[{airdate:"asc"},{sourceId:"asc"}],include:{links:{select:{status:true,eventId:true,calendarId:true,confirmedDesiredHash:true}}}}},
    }),
    db.calendarSettings.findUnique({where:{userId},select:{calendarId:true,summary:true,timeZone:true}}),
    db.syncRun.findFirst({where:{userId},orderBy:{startedAt:"desc"},select:{status:true,startedAt:true,finishedAt:true}}),
    db.installation.findUnique({where:{ownerId:userId},select:{activeAccount:{select:{needsReauth:true,refresh_token:true}}}}),
  ]);
  const account = installation?.activeAccount;
  return {calendar,timeZone:zone,needsReauth:!account?.refresh_token || account.needsReauth,
    lastRun: lastRun ? {status:lastRun.status,startedAt:lastRun.startedAt.toISOString(),finishedAt:lastRun.finishedAt?.toISOString()??null} : null,
    shows:shows.map(s=>({id:s.tvmazeId,title:s.title,sourceUrl:s.sourceUrl,poster:s.poster,bannerUrl:s.bannerUrl,year:s.year,platform:s.platform,country:s.country,status:s.status,
      summaryText:s.summaryText,genres:JSON.parse(s.genresJson) as string[],runtimeMinutes:s.runtimeMinutes,
      lastAttempt:s.lastAttemptAt?.toISOString()??null,lastSuccess:s.lastSuccessAt?.toISOString()??null,error:s.lastError,
      upcoming:s.episodes.filter(e=>e.airdate && e.airdate>=today).map(e=>({id:e.sourceId,title:e.title,season:e.season,number:e.number,date:e.airdate!,
        summaryText:e.summaryText,sourceUrl:e.sourceUrl,
        linked:e.links.some(l=>l.calendarId===calendar?.calendarId && l.status==="synced" && l.confirmedDesiredHash===calendarEventHash(episodeEvent(userId,s,e,l.eventId)))})),
      unknownDates:s.episodes.filter(e=>!e.airdate).length,
    }))};
}
export type Overview = Awaited<ReturnType<typeof overview>>;
