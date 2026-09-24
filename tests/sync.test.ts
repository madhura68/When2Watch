import { beforeEach, afterEach, describe, expect, it } from "vitest";
import raw from "./fixtures/tvmaze/slow-horses.json";
import { parseSnapshot } from "@/server/tvmaze";
import { SyncService } from "@/server/sync";
import { GoogleCalendar } from "@/server/google-calendar";
import { AppError } from "@/server/errors";
import { testDatabase } from "./database";
import { simulatedCalendar } from "./simulated-calendar";

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
});
