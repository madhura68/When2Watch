import { describe, expect, it } from "vitest";
import source from "./fixtures/tvmaze/slow-horses.json";
import matches from "./fixtures/tvmaze/slow-horses-search.json";
import { TVmaze, parseSnapshot, parseSearch } from "@/server/tvmaze";

describe("TVmaze real response contract", () => {
  it("reads display details and partial future descriptions from the unmodified source fixture", () => {
    const snapshot = parseSnapshot(source, 45039);
    expect(snapshot.show).toMatchObject({genres:["Drama","Thriller","Espionage"],runtimeMinutes:45});
    expect(snapshot.show.summaryText).toContain("Slow Horses");
    expect(snapshot.show.summaryText).not.toMatch(/<\/?p>/);
    expect(snapshot.episodes.filter(e=>e.airdate && e.airdate>="2026-09-24" && e.summaryText).map(e=>e.id)).toEqual([3643507]);
    expect(parseSearch(matches)[0]).not.toHaveProperty("summaryText");
  });
  it.each([
    {summary:null,genres:null,averageRuntime:null,runtime:null,wantGenres:[],wantRuntime:null},
    {summary:42,genres:[" Drama ",42,"","Drama",null,"Thriller"],averageRuntime:0,runtime:30,wantGenres:["Drama","Thriller"],wantRuntime:30},
    {summary:[],genres:"Drama",averageRuntime:2.5,runtime:2147483648,wantGenres:[],wantRuntime:null},
    {summary:{},genres:{},averageRuntime:2147483648,runtime:45,wantGenres:[],wantRuntime:45},
    {summary:"",genres:[],averageRuntime:-5,runtime:"45",wantGenres:[],wantRuntime:null},
    {summary:undefined,genres:undefined,averageRuntime:undefined,runtime:undefined,wantGenres:[],wantRuntime:null},
  ])("does not let optional display metadata block valid episodes: %j", ({wantGenres,wantRuntime,...fields}) => {
    const input = {...structuredClone(source),...fields};
    (input._embedded.episodes[0] as any).summary = {invalid:true};
    const snapshot = parseSnapshot(input,45039);
    expect(snapshot.show).toMatchObject({summaryText:null,genres:wantGenres,runtimeMinutes:wantRuntime});
    expect(snapshot.episodes).toHaveLength(36);
    expect(snapshot.episodes[0].summaryText).toBeNull();
  });
  it("keeps source dates, regular episode identities and ranked matches", () => {
    const snapshot = parseSnapshot(source, 45039);
    expect(snapshot.show).toMatchObject({ id: 45039, name: "Slow Horses", year: "2022", status: "Running" });
    expect(snapshot.episodes).toHaveLength(36);
    expect(snapshot.episodes.at(-1)).toMatchObject({ id: 3643510, airdate: "2026-10-21", season: 6, number: 6 });
    expect(parseSearch(matches).slice(0, 2).map(s => s.id)).toEqual([45039, 26602]);
  });
  it("rejects missing lists, wrong identities, duplicate episodes and malformed dates", () => {
    const missing = structuredClone(source); delete (missing as any)._embedded;
    expect(() => parseSnapshot(missing, 45039)).toThrowError(expect.objectContaining({code:"INVALID_SOURCE"}));
    expect(() => parseSnapshot(source, 123)).toThrowError(expect.objectContaining({code:"INVALID_SOURCE"}));
    const invalid = structuredClone(source); invalid._embedded.episodes[0].airdate = "2026-02-30";
    expect(() => parseSnapshot(invalid, 45039)).toThrowError(expect.objectContaining({code:"INVALID_SOURCE"}));
    const duplicate = structuredClone(source); duplicate._embedded.episodes.push(duplicate._embedded.episodes[0]);
    expect(() => parseSnapshot(duplicate, 45039)).toThrowError(expect.objectContaining({code:"INVALID_SOURCE"}));
  });
  it("retains unknown dates without guessing and excludes specials", () => {
    const input = structuredClone(source);
    input._embedded.episodes[0].airdate = "";
    input._embedded.episodes[1].type = "significant_special";
    const snapshot = parseSnapshot(input, 45039);
    expect(snapshot.episodes[0].airdate).toBeNull();
    expect(snapshot.episodes).toHaveLength(35);
  });
  it("accepts missing optional display metadata and empty search results", () => {
    expect(parseSearch([{score:1,show:{id:1,name:"V",url:"https://www.tvmaze.com/shows/1/v"}}])).toMatchObject([{name:"V",year:null,poster:null,platform:null}]);
    expect(parseSearch([])).toEqual([]);
    expect(() => parseSearch({})).toThrowError(expect.objectContaining({code:"INVALID_SOURCE"}));
  });
  it("only fetches searches from four trimmed characters and bounds rate-limit retries", async () => {
    const requests: string[] = []; let limited = 2;
    const api = new TVmaze(async input => { requests.push(String(input)); return limited-- > 0 ? new Response(null,{status:429}) : Response.json(matches); }, async () => {});
    for (const query of ["", "  ", "S", "Sl", " Slo "]) expect(await api.search(query)).toEqual([]);
    expect(requests).toHaveLength(0);
    expect((await api.search(" Slow "))[0].id).toBe(45039);
    expect(requests).toEqual(Array(3).fill("https://api.tvmaze.com/search/shows?q=Slow"));
    let attempts=0;
    const failing = new TVmaze(async () => { attempts++; return new Response(null,{status:429}); },async()=>{});
    await expect(failing.search("Slow Horses")).rejects.toMatchObject({code:"SOURCE_UNAVAILABLE"});
    expect(attempts).toBe(3);
  });
});
