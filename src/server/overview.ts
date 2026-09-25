import { getPreferences } from "./preferences";
import { database } from "./db";
import { localDate } from "@/lib/dates";
import type { PrismaClient } from "@prisma/client";
import { calendarEventHash, episodeEvent } from "./sync";
import { getActiveBinding } from "./calendar-bindings";

export async function overview(userId: string, db: PrismaClient = database(), now = new Date(), timeZone?: string) {
  const zone = timeZone ?? (await getPreferences(userId, db)).timeZone;
  const today = localDate(now, zone);
  const [shows,active,lastRun] = await Promise.all([
    db.trackedShow.findMany({
      where:{userId},orderBy:{title:"asc"},
      include:{episodes:{where:{present:true},orderBy:[{airdate:"asc"},{sourceId:"asc"}],include:{links:{select:{status:true,eventId:true,calendarId:true,confirmedDesiredHash:true}}}}},
    }),
    getActiveBinding(db,userId),
    db.syncRun.findFirst({where:{userId},orderBy:{startedAt:"desc"},select:{status:true,startedAt:true,finishedAt:true}}),
  ]);
  const account = "binding" in active ? active.account : null;
  const calendar = "binding" in active ? {calendarId:active.binding.calendarId,summary:active.binding.summary ?? active.binding.calendarId,timeZone:active.binding.timeZone ?? zone} : null;
  return {calendar,timeZone:zone,needsReauth:!account?.refresh_token || account.needsReauth,
    lastRun: lastRun ? {status:lastRun.status,startedAt:lastRun.startedAt.toISOString(),finishedAt:lastRun.finishedAt?.toISOString()??null} : null,
    shows:shows.map(s=>({id:s.tvmazeId,title:s.title,trying:s.trying,sourceUrl:s.sourceUrl,poster:s.poster,bannerUrl:s.bannerUrl,backgroundUrl:s.backgroundUrl,year:s.year,platform:s.platform,country:s.country,status:s.status,
      summaryText:s.summaryText,genres:JSON.parse(s.genresJson) as string[],runtimeMinutes:s.runtimeMinutes,
      lastAttempt:s.lastAttemptAt?.toISOString()??null,lastSuccess:s.lastSuccessAt?.toISOString()??null,error:s.lastError,
      upcoming:s.episodes.filter(e=>e.airdate && e.airdate>=today).map(e=>({id:e.sourceId,title:e.title,season:e.season,number:e.number,date:e.airdate!,
        summaryText:e.summaryText,sourceUrl:e.sourceUrl,
        linked:e.links.some(l=>l.calendarId===calendar?.calendarId && l.status==="synced" && l.confirmedDesiredHash===calendarEventHash(episodeEvent(userId,s,e,l.eventId)))})),
      unknownDates:s.episodes.filter(e=>!e.airdate).length,
    }))};
}
export type Overview = Awaited<ReturnType<typeof overview>>;
