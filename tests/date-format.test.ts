import { expect, it } from "vitest";
import { formatEpisodeDate, formatDayLabel } from "@/lib/dates";
it.each(["Europe/Amsterdam","Pacific/Auckland","America/New_York"])("keeps date-only labels on their calendar date under %s",zone=>{
 const previous=process.env.TZ;
 try {process.env.TZ=zone;
  expect(formatEpisodeDate("2026-10-09")).toBe("9 October");
  expect(formatDayLabel("2026-10-09")).toBe("9 October 2026");
  expect(formatDayLabel("2026-10-09",true)).toBe("Friday, 9 October 2026");
 } finally {if(previous===undefined)delete process.env.TZ;else process.env.TZ=previous;}
});
