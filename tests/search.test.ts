import { expect, it } from "vitest";
import { LatestSearch } from "@/lib/latest-search";

it("ignores late success and failure even when a provider ignores cancellation", async () => {
  const waiting = new Map<string, {resolve: (v:string[])=>void; reject:(v:Error)=>void}>();
  const search = new LatestSearch<string[]>((q:string) => new Promise<string[]>((resolve,reject) => waiting.set(q,{resolve,reject})));
  const seen: unknown[]=[];
  const first=search.find("Slow",(v:string[])=>seen.push(v),(e:unknown)=>seen.push(e));
  const second=search.find("Slow Horses",(v:string[])=>seen.push(v),(e:unknown)=>seen.push(e));
  waiting.get("Slow Horses")!.resolve(["correct"]);await second;
  waiting.get("Slow")!.resolve(["old"]);await first;
  expect(seen).toEqual([["correct"]]);
  const third=search.find("old error",(v:string[])=>seen.push(v),(e:unknown)=>seen.push(e));
  search.cancel();waiting.get("old error")!.reject(new Error("late"));await third;
  expect(seen).toEqual([["correct"]]);
});

it("allows one-character titles and clears empty searches without a request", async () => {
  const calls:string[]=[];const found:string[][]=[];
  const search=new LatestSearch<string[]>(async(q:string)=>{calls.push(q);return [q];});
  await search.find("V",(v:string[])=>found.push(v),()=>{});
  await search.find("   ",(v:string[])=>found.push(v),()=>{});
  expect(calls).toEqual(["V"]);expect(found).toEqual([["V"]]);
});
