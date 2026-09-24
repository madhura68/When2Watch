import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import raw from "./fixtures/tvmaze/slow-horses.json";
import { parseSnapshot } from "@/server/tvmaze";
import { SyncService } from "@/server/sync";
import { GoogleCalendar } from "@/server/google-calendar";
import { AppError } from "@/server/errors";
import { testDatabase } from "./database";
import { simulatedCalendar } from "./simulated-calendar";
import { overview } from "@/server/overview";

it("adds detail columns to a populated old database without changing existing records",async()=>{
 const migration="20260924100000_series_details", old=testDatabase(migration);
 try {
  await old.db.$executeRawUnsafe(`INSERT INTO User(id,email) VALUES ('old-owner','old@example.test')`);
  await old.db.$executeRawUnsafe(`INSERT INTO Session(id,sessionToken,userId,expires) VALUES ('old-session','synthetic-session','old-owner',1799999999999)`);
  await old.db.$executeRawUnsafe(`INSERT INTO Account(id,userId,type,provider,providerAccountId,refresh_token) VALUES ('old-account','old-owner','oauth','google','old-google','synthetic-token')`);
  await old.db.$executeRawUnsafe(`INSERT INTO CalendarSettings(userId,calendarId,summary,timeZone,accessRole,defaultRemindersJson) VALUES ('old-owner','chosen@example.test','When2Watch','Europe/Amsterdam','owner','[]')`);
  await old.db.$executeRawUnsafe(`INSERT INTO TrackedShow(id,userId,tvmazeId,title,sourceUrl,status) VALUES ('old-show','old-owner',45039,'Slow Horses','https://www.tvmaze.com/shows/45039','Running')`);
  await old.db.$executeRawUnsafe(`INSERT INTO Episode(id,trackedShowId,sourceId,title,airdate,sourceUrl) VALUES ('old-episode','old-show',3643507,'Resurrection','2026-09-30','https://www.tvmaze.com/episodes/3643507')`);
  await old.db.$executeRawUnsafe(`INSERT INTO CalendarEventLink(id,episodeId,calendarId,eventId,status,desiredJson,confirmedDesiredHash) VALUES ('old-link','old-episode','chosen@example.test','existing-google-event','synced','{}','existing-hash')`);
  const tables=["User","Session","Account","CalendarSettings","TrackedShow","Episode","CalendarEventLink"];
  const before:Record<string,Record<string,unknown>[]>={};
  for(const table of tables)before[table]=await old.db.$queryRawUnsafe(`SELECT * FROM "${table}"`);
  old.applyMigration(migration);
  for(const table of tables){
   const columns=Object.keys(before[table][0]).map(c=>`"${c}"`).join(",");
   expect(await old.db.$queryRawUnsafe(`SELECT ${columns} FROM "${table}"`)).toEqual(before[table]);
  }
  expect(await old.db.trackedShow.findUnique({where:{id:"old-show"}})).toMatchObject({summaryText:null,genresJson:"[]",runtimeMinutes:null});
  expect(await old.db.episode.findUnique({where:{id:"old-episode"}})).toMatchObject({summaryText:null});
  await old.db.trackedShow.update({where:{id:"old-show"},data:{summaryText:"Persisted synopsis",genresJson:'["Drama"]',runtimeMinutes:45}});
  await old.db.episode.update({where:{id:"old-episode"},data:{summaryText:"Persisted episode"}});
  await old.db.$disconnect();const reopened=old.reopen();
  try {
   expect(await reopened.trackedShow.findUnique({where:{id:"old-show"}})).toMatchObject({summaryText:"Persisted synopsis",genresJson:'["Drama"]',runtimeMinutes:45});
   expect(await reopened.episode.findUnique({where:{id:"old-episode"}})).toMatchObject({summaryText:"Persisted episode"});
  }finally{await reopened.$disconnect();}
 }finally{await old.close();}
});

describe("Episode synchronization with real SQLite and simulated providers",()=>{
 let storage:ReturnType<typeof testDatabase>, google:ReturnType<typeof simulatedCalendar>, service:SyncService;
 let input:typeof raw, sourceError=false, now:Date;
 const config={calendarId:"chosen@example.test",timeZone:"Europe/Amsterdam"};
 const source={snapshot:async()=>{if(sourceError)throw new AppError("INVALID_SOURCE",502,"Invalid snapshot");return parseSnapshot(input,45039);}};
 beforeEach(async()=>{
  storage=testDatabase();input=structuredClone(raw);sourceError=false;now=new Date("2026-09-24T07:00:00Z");google=simulatedCalendar();
  await storage.db.user.create({data:{id:"owner",email:"owner@example.test"}});
  await storage.db.calendarSettings.create({data:{userId:"owner",...config,summary:"When2Watch",accessRole:"owner",defaultRemindersJson:"[]"}});
  service=new SyncService(storage.db,new GoogleCalendar(async()=>"synthetic-access",google.fetcher),source,config,()=>now);
 });
 afterEach(async()=>{await storage?.close();});
 const active=()=>[...google.events.values()].filter(e=>e.status!=="cancelled");
 it("stores metadata corrections without Calendar writes or changed payloads, IDs and hashes",async()=>{
  await service.add("owner",45039);
  const linksBefore=await storage.db.calendarEventLink.findMany({orderBy:{id:"asc"}});
  const eventsBefore=structuredClone([...google.events.entries()]);
  input.summary="<p>A new <b>local</b> synopsis.</p>";input.genres=["Comedy"];input.averageRuntime=52;
  input._embedded.episodes.find(e=>e.id===3643507)!.summary="<p>Episode-only details.</p>";
  google.writes.length=0;
  const result=await service.sync("owner","manual");
  expect(result.series[0]).toMatchObject({created:0,updated:0,deleted:0,unchanged:5,failed:0});
  expect(google.writes).toEqual([]);
  expect(await storage.db.calendarEventLink.findMany({orderBy:{id:"asc"}})).toEqual(linksBefore);
  expect([...google.events.entries()]).toEqual(eventsBefore);
  expect(await storage.db.trackedShow.findFirst()).toMatchObject({summaryText:"A new local synopsis.",genresJson:'["Comedy"]',runtimeMinutes:52});
  expect(await storage.db.episode.findFirst({where:{sourceId:3643507}})).toMatchObject({summaryText:"Episode-only details."});
  const reopened=storage.reopen();
  try {
   sourceError=true;
   vi.stubGlobal("fetch",()=>{throw new Error("Provider disabled during overview");});
   const view=await overview("owner",reopened,now);
   expect(view.shows[0]).toMatchObject({summaryText:"A new local synopsis.",genres:["Comedy"],runtimeMinutes:52});
   expect(view.shows[0].upcoming.find(e=>e.id===3643507)).toMatchObject({summaryText:"Episode-only details.",linked:true});
   expect((await overview("other",reopened,now)).shows).toEqual([]);
  }finally{vi.unstubAllGlobals();await reopened.$disconnect();}
 });
 it("keeps cached details after source failure and clears them on a valid empty response",async()=>{
  await service.add("owner",45039);
  const before=await storage.db.trackedShow.findFirst();
  expect(before?.summaryText).toContain("Slow Horses");
  sourceError=true;google.writes.length=0;
  expect((await service.sync("owner","manual")).status).toBe("failed");
  expect((await storage.db.trackedShow.findFirst())?.summaryText).toBe(before?.summaryText);
  sourceError=false;input.summary="";input.genres=[];(input as any).averageRuntime=null;
  input._embedded.episodes.find(e=>e.id===3643507)!.summary="";
  expect((await service.sync("owner","manual")).status).toBe("success");
  expect(await storage.db.trackedShow.findFirst()).toMatchObject({summaryText:null,genresJson:"[]",runtimeMinutes:null});
  expect(await storage.db.episode.findFirst({where:{sourceId:3643507}})).toMatchObject({summaryText:null});
  expect(google.writes).toEqual([]);
 });
 it("adds one relation and five eligible dated all-day events; repeat causes zero writes",async()=>{
  const first=await service.add("owner",45039);
  expect(first.status).toBe("success");expect(first.series[0]).toMatchObject({created:5,failed:0});
  expect(active()).toHaveLength(5);
  expect(active()[0]).toMatchObject({summary:"Slow Horses S06E02 — Daddy Issues",start:{date:"2026-09-23"},end:{date:"2026-09-24"},transparency:"transparent"});
  expect(active()[0].description).toContain("Oorspronkelijke uitzenddatum");
  expect(active()[0].extendedProperties.private).toMatchObject({app:"when2watch",userId:"owner",showId:"45039",episodeId:"3643506"});
  google.writes.length=0;
  const second=await service.add("owner",45039);
  expect(second.series[0]).toMatchObject({created:0,updated:0,unchanged:5});
  expect(await storage.db.trackedShow.count()).toBe(1);expect(google.writes).toEqual([]);
 });
 it("updates date, title and description on the same Google identity, even beyond the past boundary",async()=>{
  await service.add("owner",45039); const id=active()[0].id; google.writes.length=0;
  const episode=input._embedded.episodes.find(e=>e.id===3643506)!;
  episode.airdate="2026-09-10";episode.name="Corrected title";episode.url="https://www.tvmaze.com/episodes/3643506/corrected";
  const result=await service.sync("owner","manual");
  expect(result.series[0].updated).toBe(1);
  expect(google.events.get(id)).toMatchObject({summary:"Slow Horses S06E02 — Corrected title",start:{date:"2026-09-10"}});
  expect(google.events.get(id).description).toContain("/corrected");expect(google.writes.map(w=>w.method)).toEqual(["PATCH"]);
 });
 it("does not mutate events on invalid source data or guess an unknown date",async()=>{
  await service.add("owner",45039);google.writes.length=0;sourceError=true;
  expect((await service.sync("owner","manual")).status).toBe("failed");expect(google.writes).toEqual([]);expect(active()).toHaveLength(5);
  sourceError=false;input._embedded.episodes.at(-1)!.airdate="";
  const result=await service.sync("owner","manual");expect(result.series[0].deleted).toBe(1);expect(active()).toHaveLength(4);
  expect(await storage.db.trackedShow.count()).toBe(1);
 });
 it("recovers an uncertain insert after database reopen without duplicating the event",async()=>{
  google.loseNextInsert();expect((await service.add("owner",45039)).status).not.toBe("success");
  const initialIds=active().map(e=>e.id);const reopened=storage.reopen();
  try { const retry=new SyncService(reopened,new GoogleCalendar(async()=>"synthetic-access",google.fetcher),source,config,()=>now);
   expect((await retry.sync("owner","manual")).status).toBe("success");expect(active()).toHaveLength(5);
   expect(active().map(e=>e.id)).toEqual(expect.arrayContaining(initialIds));expect(google.writes.filter(w=>w.method==="POST")).toHaveLength(5);
  }finally{await reopened.$disconnect();}
 });
 it("restores missing mappings across every Google response page without creating duplicates",async()=>{
  await service.add("owner",45039);await storage.db.calendarEventLink.deleteMany();google.writes.length=0;
  expect((await service.sync("owner","manual")).status).toBe("success");
  expect(google.writes.filter(w=>w.method==="POST")).toHaveLength(0);expect(await storage.db.calendarEventLink.count()).toBe(5);
 });
 it("does not overwrite foreign markers and reports duplicate own identities",async()=>{
  await service.add("owner",45039);const e=active()[0];google.writes.length=0;
  google.events.set("duplicate",{...structuredClone(e),id:"duplicate"});
  expect((await service.sync("owner","manual")).status).not.toBe("success");expect(google.writes).toEqual([]);
  google.events.delete("duplicate");e.extendedProperties.private.userId="other";
  expect((await service.sync("owner","manual")).status).not.toBe("success");expect(google.writes).toEqual([]);
 });
 it("keeps delete intent through a provider failure, then uses a fresh ID if the episode returns",async()=>{
  await service.add("owner",45039);const old=active().at(-1)!.id;const removed=input._embedded.episodes.pop()!;
  google.failNextDelete();expect((await service.sync("owner","manual")).status).not.toBe("success");
  expect((await service.sync("owner","manual")).series[0].deleted).toBe(1);
  input._embedded.episodes.push(removed);expect((await service.sync("owner","manual")).series[0].created).toBe(1);
  expect(active()).toHaveLength(5);expect(active().some(e=>e.id===old)).toBe(false);
 });
 it("does not create old history; includes the seven-day boundary in Amsterdam",async()=>{
  input._embedded.episodes=input._embedded.episodes.slice(-3);
  input._embedded.episodes[0].airdate="2026-09-16";
  input._embedded.episodes[1].airdate="2026-09-17";
  input._embedded.episodes[2].airdate="2026-09-18";
  expect((await service.add("owner",45039)).series[0].created).toBe(2);
  expect(active().map(e=>e.start.date)).toEqual(["2026-09-17","2026-09-18"]);
 });
 it("serializes simultaneous additions and retains a followed series after a Calendar failure",async()=>{
  const results=await Promise.all([service.add("owner",45039),service.add("owner",45039)]);
  expect(results.every(r=>r.status==="success")).toBe(true);expect(await storage.db.trackedShow.count()).toBe(1);expect(active()).toHaveLength(5);
 });
 it("keeps series and fetched episodes when no calendar has been confirmed",async()=>{
  await storage.db.calendarSettings.deleteMany();const result=await service.add("owner",45039);
  expect(result.status).not.toBe("success");expect(google.writes).toEqual([]);expect(await storage.db.trackedShow.count()).toBe(1);
  expect(await storage.db.episode.count()).toBe(36);
 });
 it("repairs a changed reminder after a confirmed sync instead of silently adopting it",async()=>{
  await service.add("owner",45039);google.writes.length=0;
  active()[0].reminders={useDefault:false,overrides:[{method:"popup",minutes:60}]};
  const result=await service.sync("owner","manual");
  expect(result.series[0].updated).toBe(1);expect(google.writes.map(w=>w.method)).toEqual(["PATCH"]);
 });
 it("filters broad Google property matches locally using the complete ownership tuple",async()=>{
  await service.add("owner",45039);
  google.events.set("foreign",{...structuredClone(active()[0]),id:"foreign",extendedProperties:{private:{app:"different-app",kind:"episode",userId:"owner",showId:"45039"}}});
  const own=await new GoogleCalendar(async()=>"synthetic-access",google.fetcher).ownedEpisodes(config.calendarId,"owner",45039);
  expect(own).toHaveLength(5);expect(own.some(e=>e.id==="foreign")).toBe(false);
 });
 it.each(["date","title","show title"])("does not label changed %s as confirmed after a Google read failure",async(field)=>{
  await service.add("owner",45039);
  const displayed=async()=>(await overview("owner",storage.db,now)).shows[0].upcoming.find(e=>e.id===3643507)!;
  expect((await displayed()).linked).toBe(true);
  const episode=input._embedded.episodes.find(e=>e.id===3643507)!;
  if(field==="date")episode.airdate="2026-10-01";
  else if(field==="title")episode.name="Corrected name";
  else input.name="Corrected show title";
  google.failNextCalendarRead();
  expect((await service.sync("owner","manual")).status).toBe("failed");
  expect((await displayed()).linked).toBe(false);
  expect((await service.sync("owner","manual")).status).toBe("success");
  expect((await displayed()).linked).toBe(true);
 });
});
