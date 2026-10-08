import { expect, it } from "vitest";
import { resolveWallTime, formatInZone, offsetMinutes, localDateIn } from "@/server/event-time";
it.each([
 ["2026-10-09","20:00","Europe/Amsterdam","2026-10-09T20:00:00+02:00"],
 ["2026-10-25","02:30","Europe/Amsterdam","2026-10-25T02:30:00+02:00"],
 ["2026-03-29","02:30","Europe/Amsterdam","2026-03-29T03:30:00+02:00"],
 ["2026-03-08","03:30","America/New_York","2026-03-08T03:30:00-04:00"],
 ["2026-11-01","02:30","America/New_York","2026-11-01T02:30:00-05:00"],
 ["2026-03-08","02:30","America/New_York","2026-03-08T03:30:00-04:00"],
 ["2026-11-01","01:30","America/New_York","2026-11-01T01:30:00-04:00"],
 ["2026-10-04","02:30","Australia/Sydney","2026-10-04T03:30:00+11:00"],
 ["2026-04-05","02:30","Australia/Sydney","2026-04-05T02:30:00+11:00"],
 ["2026-10-03","20:00","Australia/Sydney","2026-10-03T20:00:00+10:00"],
 ["2026-09-26","20:00","Pacific/Auckland","2026-09-26T20:00:00+12:00"],
])("resolves wall time %s %s in %s", (date,time,zone,want) => expect(formatInZone(resolveWallTime(date,time,zone),zone)).toBe(want));
it("uses elapsed duration across the autumn offset transition",()=>{
 const start=resolveWallTime("2026-10-25","02:30","Europe/Amsterdam");
 expect(start.toISOString()).toBe("2026-10-25T00:30:00.000Z");
 expect(formatInZone(new Date(start.getTime()+3600000),"Europe/Amsterdam")).toBe("2026-10-25T02:30:00+01:00");
 expect(offsetMinutes(start,"Europe/Amsterdam")).toBe(120);
 expect(localDateIn(new Date("2026-10-09T02:00:00Z"),"America/New_York")).toBe("2026-10-08");
});
