import { afterEach, expect, it, vi } from "vitest";
import { refreshBanner } from "@/server/banners";
import { parseSnapshot } from "@/server/tvmaze";
import { SyncService } from "@/server/sync";
import { GoogleCalendar } from "@/server/google-calendar";
import { overview } from "@/server/overview";
import { agendaOverview } from "@/server/agenda";
import { testDatabase } from "./database";
import { simulatedCalendar } from "./simulated-calendar";
import raw from "./fixtures/tvmaze/slow-horses.json";

let storage:ReturnType<typeof testDatabase>;
afterEach(async()=>{vi.unstubAllGlobals();await storage?.close();});
const url="https://static.tvmaze.com/uploads/images/medium_leaderboard/595/1489665.jpg";
const day=86400_000, start=new Date("2026-09-24T07:00:00Z");
it("adds only nullable banner columns while preserving populated series",async()=>{
  const migration="20260924121000_series_banners";storage=testDatabase(migration);const db=storage.db;
  await db.user.create({data:{id:"owner"}});
  await db.trackedShow.create({data:{id:"existing",userId:"owner",tvmazeId:45039,title:"Slow Horses",sourceUrl:"https://www.tvmaze.com/shows/45039",status:"Running",summaryText:"Existing synopsis"},select:{id:true}});
  const before=await db.$queryRaw<Record<string,unknown>[]>`SELECT * FROM TrackedShow`;
  storage.applyMigration(migration);
  const columns=Object.keys(before[0]).map(column=>`"${column}"`).join(",");
  expect(await db.$queryRawUnsafe(`SELECT ${columns} FROM TrackedShow`)).toEqual(before);
  expect(await db.trackedShow.findUnique({where:{id:"existing"}})).toMatchObject({bannerUrl:null,bannerNextCheckAt:null});
});
async function setup() {
  storage=testDatabase(); const db=storage.db;
  await db.user.create({data:{id:"owner"}});
  const show=await db.trackedShow.create({data:{userId:"owner",tvmazeId:45039,title:"Slow Horses",sourceUrl:"https://www.tvmaze.com/shows/45039",status:"Running"}});
  return {db,show};
}
it("caches success and absence for seven days across database reopen",async()=>{
  const {db,show}=await setup();let selected:string|null=url;
  const banner=vi.fn(async()=>selected);
  await refreshBanner(db,{banner},show,start);
  expect(await db.trackedShow.findUnique({where:{id:show.id}})).toMatchObject({bannerUrl:url,bannerNextCheckAt:new Date(+start+7*day)});
  await db.$disconnect();const reopened=storage.reopen();
  try {
    await refreshBanner(reopened,{banner},(await reopened.trackedShow.findUniqueOrThrow({where:{id:show.id}})),new Date(+start+7*day-1));
    expect(banner).toHaveBeenCalledTimes(1);
    selected=null;
    await refreshBanner(reopened,{banner},(await reopened.trackedShow.findUniqueOrThrow({where:{id:show.id}})),new Date(+start+7*day));
    expect(await reopened.trackedShow.findUnique({where:{id:show.id}})).toMatchObject({bannerUrl:null,bannerNextCheckAt:new Date(+start+14*day)});
    await refreshBanner(reopened,{banner},(await reopened.trackedShow.findUniqueOrThrow({where:{id:show.id}})),new Date(+start+8*day));
    expect(banner).toHaveBeenCalledTimes(2);
  }finally{await reopened.$disconnect();}
});
it("retains the previous banner on a source error and retries no earlier than 24 hours",async()=>{
  const {db,show}=await setup();await db.trackedShow.update({where:{id:show.id},data:{bannerUrl:url}});
  const banner=vi.fn(async():Promise<string|null>=>{throw Error("temporary source error");});
  const current=()=>db.trackedShow.findUniqueOrThrow({where:{id:show.id}});
  await refreshBanner(db,{banner},await current(),start);
  expect(await current()).toMatchObject({bannerUrl:url,bannerNextCheckAt:new Date(+start+day)});
  await refreshBanner(db,{banner},await current(),new Date(+start+day-1));
  expect(banner).toHaveBeenCalledTimes(1);
  await refreshBanner(db,{banner},await current(),new Date(+start+day));
  expect(banner).toHaveBeenCalledTimes(2);
  expect(await current()).toMatchObject({bannerUrl:url,bannerNextCheckAt:new Date(+start+2*day)});
});
it("does not let banner failure block following/Calendar sync or let new banners alter events",async()=>{
  const {db}=await setup();const google=simulatedCalendar();const config={calendarId:"chosen@example.test",timeZone:"Europe/Amsterdam"};
  await db.calendarSettings.create({data:{userId:"owner",...config,summary:"When2Watch",accessRole:"owner",defaultRemindersJson:"[]"}});
  let now=start;
  const banner=vi.fn(async():Promise<string|null>=>{throw Error("source unavailable");});
  const source={snapshot:async()=>parseSnapshot(raw,45039),banner};
  const service=new SyncService(db,new GoogleCalendar(async()=>"synthetic-access",google.fetcher),source,config,()=>now);
  expect((await service.add("owner",45039)).status).toBe("success");
  const links=await db.calendarEventLink.findMany({orderBy:{id:"asc"}}), events=structuredClone([...google.events.entries()]);
  google.writes.length=0;
  expect((await service.sync("owner","manual")).status).toBe("success");expect(banner).toHaveBeenCalledTimes(1);
  now=new Date(+start+day);banner.mockResolvedValue(url);
  expect((await service.sync("owner","manual")).status).toBe("success");expect(banner).toHaveBeenCalledTimes(2);
  expect(google.writes).toEqual([]);expect(await db.calendarEventLink.findMany({orderBy:{id:"asc"}})).toEqual(links);
  expect([...google.events.entries()]).toEqual(events);
  vi.stubGlobal("fetch",()=>{throw Error("no source request allowed during a page read");});
  expect((await overview("owner",db,now)).shows[0].bannerUrl).toBe(url);
  expect((await agendaOverview("owner",now,db)).groups[0].episodes[0].show.bannerUrl).toBe(url);
  await agendaOverview("owner",now,db);expect(banner).toHaveBeenCalledTimes(2);
});
