import {expect,it} from "vitest";
import {isolatedProbeDatabase, probeAttemptReady, probeAuthFailure} from "../scripts/google-probe-guards";

const initial={id:"attempt",sessionHash:null,expires:2000};
it("requires a live cookie-bound initial attempt before OAuth can start",()=>{
  expect(probeAttemptReady(undefined,"attempt",null,false,1000)).toBe(false);
  expect(probeAttemptReady(initial,undefined,null,false,1000)).toBe(false);
  expect(probeAttemptReady(initial,"wrong",null,false,1000)).toBe(false);
  expect(probeAttemptReady(initial,"attempt",null,false,2000)).toBe(false);
  expect(probeAttemptReady(initial,"attempt",null,false,1000)).toBe(true);
  expect(probeAttemptReady({...initial,completed:true},"attempt",null,false,1000)).toBe(false);
});
it("requires the initiating owner session for a later connection",()=>{
  expect(probeAttemptReady(initial,"attempt",null,true,1000)).toBe(false);
  const attempt={...initial,sessionHash:"initiator"};
  expect(probeAttemptReady(attempt,"attempt",null,true,1000)).toBe(false);
  expect(probeAttemptReady(attempt,"attempt","different",true,1000)).toBe(false);
  expect(probeAttemptReady(attempt,"attempt","initiator",true,1000)).toBe(true);
});
it("classifies OAuth failures without copying provider error data or secrets",()=>{
  expect(probeAuthFailure({error:new Error("State cookie was missing.")})).toBe("missing_state_cookie");
  expect(probeAuthFailure({error:new Error("PKCE code_verifier cookie was missing.")})).toBe("missing_pkce_cookie");
  expect(probeAuthFailure({error:new Error("invalid_grant (a secret could follow)")})).toBe("invalid_grant");
  expect(probeAuthFailure({error:new Error("something with access_token=private")})).toBe("unknown");
  expect(probeAuthFailure(null)).toBe("unknown");
});
it("accepts only a separate, explicitly named PostgreSQL probe database",()=>{
  const production="postgresql://when2watch_app:x@db:5432/when2watch";
  expect(isolatedProbeDatabase("postgresql://probe:x@db:5432/when2watch_trial",production)).toBe("postgresql://probe:x@db:5432/when2watch_trial");
  expect(isolatedProbeDatabase("postgresql://postgres:x@127.0.0.1:55432/w2w_probe_b0",undefined)).toContain("w2w_probe_b0");
  expect(()=>isolatedProbeDatabase(undefined,production)).toThrow(/probe database/);
  expect(()=>isolatedProbeDatabase("file:/tmp/probe.db",production)).toThrow(/PostgreSQL/);
  expect(()=>isolatedProbeDatabase("postgresql://other:y@db:5432/when2watch",production)).toThrow(/production/);
  expect(()=>isolatedProbeDatabase("postgresql://probe:x@db:5432/scratch",production)).toThrow(/probe or trial/);
});
