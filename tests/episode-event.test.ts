import { expect, it } from "vitest";
import { desiredEpisodeEvent } from "@/server/episode-event";
const ctx = {userId:"owner",origin:"https://when2watch.example.test",calendarId:"own",timeZone:"Europe/Amsterdam",eventMode:"ALL_DAY" as const,eventTime:null};
const show={title:"Example",tvmazeId:1,platform:"Example channel",country:"United Kingdom",runtimeMinutes:45};
const episode={sourceId:2,title:"Opening",season:1,number:2,airdate:"2026-10-09",sourceUrl:"https://www.tvmaze.com/episodes/2"};
it("builds English all-day content and preserves ownership",()=>{
 const e=desiredEpisodeEvent(ctx,show,episode,"own");
 expect(e.summary).toBe("Example · S01E02 · Opening");
 expect(e.description).toBe("Originally on Example channel (United Kingdom).\nOriginal release date according to TVmaze.\nEpisode: https://www.tvmaze.com/episodes/2\nWhen2Watch: https://when2watch.example.test/following#show-1\nSource: TVmaze (CC BY-SA).");
 expect(e.start).toEqual({date:"2026-10-09"});expect(e.end).toEqual({date:"2026-10-10"});
 expect(e.location).toBeUndefined();expect(e.extendedProperties?.private).toEqual({app:"when2watch",kind:"episode",userId:"owner",showId:"1",episodeId:"2"});
});
it("omits missing episode fields and adds provider location only when available",()=>{
 const e=desiredEpisodeEvent(ctx,{...show,platform:null,country:null},{...episode,title:"",season:null,number:null},"own",{country:"Netherlands",names:["A","B"]});
 expect(e.summary).toBe("Example");expect(e.description).toContain("Original broadcaster not known.");
 expect(e.location).toBe("Netherlands: A, B");expect(e.description).toContain("Watch availability: JustWatch via TMDB.");
});
it.each([[45,"2026-10-09T20:45:00+02:00"],[null,"2026-10-09T21:00:00+02:00"]])("uses episode runtime or sixty-minute fallback: %s",(runtime,end)=>{
 const e=desiredEpisodeEvent({...ctx,eventMode:"FIXED_TIME",eventTime:"20:00"},{...show,runtimeMinutes:runtime},episode,"own");
 expect(e.start).toEqual({dateTime:"2026-10-09T20:00:00+02:00",timeZone:"Europe/Amsterdam"});
 expect(e.end).toEqual({dateTime:end,timeZone:"Europe/Amsterdam"});
});
