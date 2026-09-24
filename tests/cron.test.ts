import { expect, it } from "vitest";
import { cronResponse } from "@/server/cron";
import { serializeCalendarMutation } from "@/server/calendar-mutations";

const secret="synthetic-cron-secret-at-least-32-characters";
const request=(token?:string)=>new Request("http://localhost/api/cron/sync",{method:"POST",headers: token ? {authorization:`Bearer ${token}`} : {}});
it("rejects missing and incorrect credentials before any work",async()=>{
 let calls=0;
 for(const token of [undefined,"wrong",secret+"x"]) {
  expect((await cronResponse(request(token),secret,async()=>{calls++;return {status:"success"};})).status).toBe(401);
 }
 expect(calls).toBe(0);
});
it("returns 200 for success and 502 for a partial or complete failure",async()=>{
 for(const status of ["success","partial","failed"]) {
  const response=await cronResponse(request(secret),secret,async()=>({status,series:[]}));
  expect(response.status).toBe(status==="success"?200:502);expect(await response.json()).toMatchObject({status});
 }
});
it("returns busy while an interactive Calendar action holds the same user's lock",async()=>{
 let finish!:()=>void,entered!:()=>void;const ready=new Promise<void>(r=>entered=r), gate=new Promise<void>(r=>finish=r);
 const manual=serializeCalendarMutation("cron-test-user",async()=>{entered();await gate;});await ready;
 let cronCalls=0;
 const response=await cronResponse(request(secret),secret,()=>serializeCalendarMutation("cron-test-user",async()=>{cronCalls++;return {status:"success"};},true));
 expect(response.status).toBe(409);expect(await response.json()).toMatchObject({status:"busy"});expect(cronCalls).toBe(0);
 finish();await manual;
 expect((await cronResponse(request(secret),secret,()=>serializeCalendarMutation("cron-test-user",async()=>({status:"success"}),true))).status).toBe(200);
});
