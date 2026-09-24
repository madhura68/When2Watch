// Operator-only proof. Bundle for Node, execute inside the authorized app
// container. No HTTP route exposes this script. Uses an isolated temporary DB.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import fixture from "../tests/fixtures/tvmaze/slow-horses.json";
import { config } from "../src/server/config";
import { GoogleCalendar } from "../src/server/google-calendar";
import { getGoogleAccessToken, googleTokenRefresher } from "../src/server/google-tokens";
import { SyncService } from "../src/server/sync";
import { parseSnapshot } from "../src/server/tvmaze";
import { localDate, nextDate } from "../src/lib/dates";

async function main() {
  assert(process.argv.includes("--authorized-recovery-probe"),"Explicit operator invocation required");
  const settings=config(), production=new PrismaClient(), path=`/tmp/when2watch-recovery-${randomUUID()}.db`;
  const url=`file:${path}`, syntheticId=2147483600;
  let trial:PrismaClient|undefined, cleanup:(()=>Promise<unknown>)|undefined, cleaned=false;
  const evidence:Record<string,unknown>={at:new Date().toISOString(),kind:"simulated-source-and-lost-response-with-real-Google",syntheticEpisodeId:syntheticId};
  try {
    const user=await production.user.findUniqueOrThrow({where:{email:settings.allowedEmail},select:{id:true,email:true}});
    const calendar=await production.calendarSettings.findUniqueOrThrow({where:{userId:user.id}});
    assert.equal(calendar.calendarId,settings.calendarId);
    const token=()=>getGoogleAccessToken(production,user.id,googleTokenRefresher(settings.clientId,settings.clientSecret));
    const writes:{method:string;id:string;httpStatus:number}[]=[];
    let loseFirstInsert=true;
    const fetcher:typeof fetch=async(input,init)=>{
      const method=init?.method??"GET",endpoint=new URL(String(input));
      const mutation=["POST","PATCH","DELETE"].includes(method);
      let eventId="";
      if(mutation){
        assert.equal(endpoint.origin,"https://www.googleapis.com");
        assert(endpoint.pathname.startsWith(`/calendar/v3/calendars/${encodeURIComponent(settings.calendarId)}/events`));
        const candidate=method==="DELETE"
          ? await (await fetch(String(input),{headers:init?.headers,signal:AbortSignal.timeout(15000)})).json()
          : JSON.parse(String(init?.body));
        const m=candidate.extendedProperties?.private;
        assert.equal(m?.app,"when2watch");assert.equal(m?.kind,"episode");assert.equal(m?.userId,user.id);
        assert.equal(m?.showId,"45039");assert.equal(m?.episodeId,String(syntheticId));
        assert(candidate.summary?.startsWith("[PROEF When2Watch]"));
        eventId=candidate.id;
      }
      const response=await fetch(input,init);
      if(mutation)writes.push({method,id:eventId,httpStatus:response.status});
      if(method==="POST"&&response.ok&&loseFirstInsert){
        await response.clone().json();loseFirstInsert=false;
        throw new Error("Controlled loss after Google committed the own synthetic event");
      }
      return response;
    };
    const google=new GoogleCalendar(token,fetcher);
    await google.calendar(settings.calendarId);
    execFileSync(process.execPath,["/app/node_modules/prisma/build/index.js","migrate","deploy","--schema","/app/prisma/schema.prisma"],{
      env:{...process.env,DATABASE_URL:url,RUST_LOG:"info"},stdio:"pipe",
    });
    trial=new PrismaClient({datasourceUrl:url});
    await trial.user.create({data:user});
    await trial.calendarSettings.create({data:calendar});
    const input=structuredClone(fixture);
    input.name="[PROEF When2Watch] Slow Horses";
    const episode=structuredClone(input._embedded.episodes.at(-1)!);
    episode.id=syntheticId;episode.name="SIMULATIE — geen echte aflevering";episode.airdate=nextDate(localDate(new Date()));
    input._embedded.episodes=[episode];
    const source={snapshot:async()=>parseSnapshot(input,45039)};
    const service=()=>new SyncService(trial!,google,source,settings);
    cleanup=async()=>{input._embedded.episodes=[];const result=await service().sync(user.id,"manual");assert.equal(result.status,"success");cleaned=true;return result;};
    const first=await service().add(user.id,45039);
    assert.notEqual(first.status,"success");
    const prepared=await trial.calendarEventLink.findFirstOrThrow();
    assert.equal(prepared.status,"prepared");
    const actual=await google.event(settings.calendarId,prepared.eventId);
    assert.equal(actual.extendedProperties?.private?.episodeId,String(syntheticId));
    evidence.uncertainCreate={status:first.status,eventId:prepared.eventId,googleConfirmed:true};
    await trial.$disconnect();trial=new PrismaClient({datasourceUrl:url});
    const resumed=await service().sync(user.id,"manual");assert.equal(resumed.status,"success");
    assert.equal(writes.filter(w=>w.method==="POST").length,1);
    evidence.reopenRecovery={result:resumed,insertRequests:1,eventId:(await trial.calendarEventLink.findFirstOrThrow()).eventId};
    episode.airdate=nextDate(episode.airdate);episode.name="SIMULATIE — datumcorrectie";
    const corrected=await service().sync(user.id,"manual");assert.equal(corrected.series[0].updated,1);
    const readback=await google.event(settings.calendarId,prepared.eventId);
    assert.equal(readback.start.date,episode.airdate);assert.equal(readback.id,prepared.eventId);
    evidence.dateCorrection={result:corrected,eventId:readback.id,date:readback.start.date};
    const before=writes.length, repeat=await service().sync(user.id,"manual");
    assert.equal(repeat.status,"success");assert.equal(writes.length,before);
    evidence.repeat={result:repeat,calendarWrites:0};
    evidence.cleanup=await cleanup();
    const remaining=(await google.ownedEpisodes(settings.calendarId,user.id,45039)).filter(e=>e.extendedProperties?.private?.episodeId===String(syntheticId));
    assert.equal(remaining.length,0);evidence.remainingSyntheticEvents=0;evidence.writes=writes;
    console.log(JSON.stringify(evidence,null,2));
  }finally{
    if(cleanup&&!cleaned){
      try{await cleanup();}catch{console.error(JSON.stringify({cleanup:"failed",database:path,syntheticEpisodeId:syntheticId}));}
    }
    await trial?.$disconnect();await production.$disconnect();
  }
}
main().catch(()=>{console.error("Recovery proof failed; inspect the sanitized evidence and own synthetic event.");process.exitCode=1;});
