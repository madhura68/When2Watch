import {expect,it} from "vitest";
import {probeAttemptReady, probeAuthFailure} from "../scripts/google-probe-guards";

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
