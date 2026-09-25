import { afterEach, expect, it, vi } from "vitest";
import { refreshArtwork } from "@/server/banners";
import { parseSnapshot, type ShowArtwork } from "@/server/tvmaze";
import { SyncService } from "@/server/sync";
import { GoogleCalendar } from "@/server/google-calendar";
import { overview } from "@/server/overview";
import { agendaOverview } from "@/server/agenda";
import { legacySqliteDatabase, testDatabase } from "./database";
import { simulatedCalendar } from "./simulated-calendar";
import raw from "./fixtures/tvmaze/slow-horses.json";

let storage:ReturnType<typeof testDatabase>;
afterEach(async()=>{vi.unstubAllGlobals();await storage?.close();});
const url="https://static.tvmaze.com/uploads/images/medium_leaderboard/595/1489665.jpg";
const backgroundUrl="https://static.tvmaze.com/uploads/images/original_untouched/631/1577977.jpg";
const day=86400_000, start=new Date("2026-09-24T07:00:00Z");
it("adds only nullable banner columns while preserving populated series",async()=>{
  const migration="20260924121000_series_banners",legacy=legacySqliteDatabase(migration);
  try {
    legacy.sqlite.exec(`INSERT INTO User(id) VALUES ('owner')`);
    legacy.sqlite.exec(`INSERT INTO TrackedShow(id,userId,tvmazeId,title,sourceUrl,status,summaryText) VALUES ('existing','owner',45039,'Slow Horses','https://www.tvmaze.com/shows/45039','Running','Existing synopsis')`);
    const before=legacy.all(`SELECT * FROM TrackedShow`);
    legacy.applyMigration(migration);
    const columns=Object.keys(before[0]).map(column=>`"${column}"`).join(",");
    expect(legacy.all(`SELECT ${columns} FROM TrackedShow`)).toEqual(before);
    expect(legacy.all(`SELECT bannerUrl,bannerNextCheckAt FROM TrackedShow`)).toEqual([{bannerUrl:null,bannerNextCheckAt:null}]);
  } finally {legacy.close();}
});
async function setup() {
  storage=testDatabase(); const db=storage.db;
  await db.user.create({data:{id:"owner"}});
  const show=await db.trackedShow.create({data:{userId:"owner",tvmazeId:45039,title:"Slow Horses",sourceUrl:"https://www.tvmaze.com/shows/45039",status:"Running"}});
  return {db,show};
}
it("stores background artwork during sync and serves it with the existing poster in Agenda",async()=>{
  const {db}=await setup();const google=simulatedCalendar();
  const backgroundUrl="https://static.tvmaze.com/uploads/images/original_untouched/631/1577977.jpg";
  const source={snapshot:async()=>parseSnapshot(raw,45039),artwork:async()=>({bannerUrl:null,backgroundUrl})};
  const service=new SyncService(db,new GoogleCalendar(async()=>"synthetic-access",google.fetcher),source,{calendarId:"chosen@example.test",timeZone:"Europe/Amsterdam"},()=>start);
  expect((await service.sync("owner","manual")).status).toBe("success");
  vi.stubGlobal("fetch",()=>{throw Error("page reads must not fetch metadata");});
  expect((await agendaOverview("owner",start,db)).groups[0].episodes[0].show).toMatchObject({bannerUrl:null,backgroundUrl,poster:"https://static.tvmaze.com/uploads/images/medium_portrait/641/1604425.jpg"});
  expect(google.writes).toEqual([]);
});
it("caches success and absence for seven days across database reopen",async()=>{
  const {db,show}=await setup();let selected:ShowArtwork={bannerUrl:url,backgroundUrl};
  const artwork=vi.fn(async()=>selected);
  await refreshArtwork(db,{artwork},show,start);
  expect(await db.trackedShow.findUnique({where:{id:show.id}})).toMatchObject({bannerUrl:url,backgroundUrl,bannerNextCheckAt:new Date(+start+7*day)});
  await db.$disconnect();const reopened=storage.reopen();
  try {
    await refreshArtwork(reopened,{artwork},(await reopened.trackedShow.findUniqueOrThrow({where:{id:show.id}})),new Date(+start+7*day-1));
    expect(artwork).toHaveBeenCalledTimes(1);
    selected={bannerUrl:null,backgroundUrl:null};
    await refreshArtwork(reopened,{artwork},(await reopened.trackedShow.findUniqueOrThrow({where:{id:show.id}})),new Date(+start+7*day));
    expect(await reopened.trackedShow.findUnique({where:{id:show.id}})).toMatchObject({bannerUrl:null,backgroundUrl:null,bannerNextCheckAt:new Date(+start+14*day)});
    await refreshArtwork(reopened,{artwork},(await reopened.trackedShow.findUniqueOrThrow({where:{id:show.id}})),new Date(+start+8*day));
    expect(artwork).toHaveBeenCalledTimes(2);
  }finally{await reopened.$disconnect();}
});
it("retains the previous banner and background on a source error and retries no earlier than 24 hours",async()=>{
  const {db,show}=await setup();await db.trackedShow.update({where:{id:show.id},data:{bannerUrl:url,backgroundUrl}});
  const artwork=vi.fn(async():Promise<ShowArtwork>=>{throw Error("temporary source error");});
  const current=()=>db.trackedShow.findUniqueOrThrow({where:{id:show.id}});
  await refreshArtwork(db,{artwork},await current(),start);
  expect(await current()).toMatchObject({bannerUrl:url,backgroundUrl,bannerNextCheckAt:new Date(+start+day)});
  await refreshArtwork(db,{artwork},await current(),new Date(+start+day-1));
  expect(artwork).toHaveBeenCalledTimes(1);
  await refreshArtwork(db,{artwork},await current(),new Date(+start+day));
  expect(artwork).toHaveBeenCalledTimes(2);
  expect(await current()).toMatchObject({bannerUrl:url,backgroundUrl,bannerNextCheckAt:new Date(+start+2*day)});
});
it("does not let banner failure block following/Calendar sync or let new banners alter events",async()=>{
  const {db}=await setup();const google=simulatedCalendar();const config={calendarId:"chosen@example.test",timeZone:"Europe/Amsterdam"};
  await db.calendarSettings.create({data:{userId:"owner",...config,summary:"When2Watch",accessRole:"owner",defaultRemindersJson:"[]"}});
  let now=start;
  const artwork=vi.fn(async():Promise<ShowArtwork>=>{throw Error("source unavailable");});
  const source={snapshot:async()=>parseSnapshot(raw,45039),artwork};
  const service=new SyncService(db,new GoogleCalendar(async()=>"synthetic-access",google.fetcher),source,config,()=>now);
  expect((await service.add("owner",45039)).status).toBe("success");
  const links=await db.calendarEventLink.findMany({orderBy:{id:"asc"}}), events=structuredClone([...google.events.entries()]);
  google.writes.length=0;
  expect((await service.sync("owner","manual")).status).toBe("success");expect(artwork).toHaveBeenCalledTimes(1);
  now=new Date(+start+day);artwork.mockResolvedValue({bannerUrl:url,backgroundUrl});
  expect((await service.sync("owner","manual")).status).toBe("success");expect(artwork).toHaveBeenCalledTimes(2);
  expect(google.writes).toEqual([]);expect(await db.calendarEventLink.findMany({orderBy:{id:"asc"}})).toEqual(links);
  expect([...google.events.entries()]).toEqual(events);
  vi.stubGlobal("fetch",()=>{throw Error("no source request allowed during a page read");});
  expect((await overview("owner",db,now)).shows[0].bannerUrl).toBe(url);
  expect((await agendaOverview("owner",now,db)).groups[0].episodes[0].show).toMatchObject({bannerUrl:url,backgroundUrl,poster:"https://static.tvmaze.com/uploads/images/medium_portrait/641/1604425.jpg"});
  await agendaOverview("owner",now,db);expect(artwork).toHaveBeenCalledTimes(2);
});

it("adds a nullable background while preserving every existing show field and the old negative cache",async()=>{
  const migration="20260924180000_series_backgrounds",legacy=legacySqliteDatabase(migration);
  try {
    legacy.sqlite.exec(`INSERT INTO User(id) VALUES ('owner')`);
    legacy.sqlite.exec(`INSERT INTO TrackedShow(id,userId,tvmazeId,title,sourceUrl,status,poster,bannerNextCheckAt) VALUES ('existing','owner',44776,'Lanterns','https://www.tvmaze.com/shows/44776','Running','https://static.tvmaze.com/uploads/images/medium_portrait/637/1592971.jpg',${+start+7*day})`);
    const before=legacy.all(`SELECT * FROM TrackedShow`);
    legacy.applyMigration(migration);
    const columns=Object.keys(before[0]).map(column=>`"${column}"`).join(",");
    expect(legacy.all(`SELECT ${columns} FROM TrackedShow`)).toEqual(before);
    expect(legacy.all(`SELECT backgroundUrl FROM TrackedShow`)).toEqual([{backgroundUrl:null}]);
  } finally {legacy.close();}
  // Runtime behaviour of the preserved negative cache, on the current PostgreSQL schema.
  storage=testDatabase();const db=storage.db;
  await db.user.create({data:{id:"owner"}});
  await db.trackedShow.create({data:{id:"existing",userId:"owner",tvmazeId:44776,title:"Lanterns",sourceUrl:"https://www.tvmaze.com/shows/44776",status:"Running",poster:"https://static.tvmaze.com/uploads/images/medium_portrait/637/1592971.jpg",bannerNextCheckAt:new Date(+start+7*day)}});
  const show=await db.trackedShow.findUniqueOrThrow({where:{id:"existing"}});
  expect(show.backgroundUrl).toBeNull();
  const artwork=vi.fn(async()=>({bannerUrl:null,backgroundUrl}));
  await refreshArtwork(db,{artwork},show,new Date(+start+day));
  expect(artwork).not.toHaveBeenCalled();
  expect((await db.trackedShow.findUniqueOrThrow({where:{id:show.id}})).bannerNextCheckAt).toEqual(new Date(+start+7*day));
});
