import { afterEach, expect, it } from "vitest";
import { loadSyncSettings } from "@/server/sync-settings";
import { testDatabase } from "./database";
import { bindCalendar } from "./fixtures/users";
let storage: ReturnType<typeof testDatabase>;
afterEach(async () => { await storage?.close(); });
it("loads own binding and style while falling back for legacy offset zones", async () => {
  storage = testDatabase(); const db = storage.db;
  await db.user.create({data:{id:"owner"}});
  expect(await loadSyncSettings("owner",db)).toEqual({calendarId:"",timeZone:"Europe/Amsterdam",eventMode:"ALL_DAY",eventTime:null});
  await bindCalendar(db,"owner","own@example.test");
  await db.userPreferences.create({data:{userId:"owner",timeZone:"+02:00",eventMode:"FIXED_TIME",eventTime:"20:00"}});
  expect(await loadSyncSettings("owner",db)).toEqual({calendarId:"own@example.test",timeZone:"Europe/Amsterdam",eventMode:"FIXED_TIME",eventTime:"20:00"});
  await db.userPreferences.update({where:{userId:"owner"},data:{eventTime:null}});
  expect(await loadSyncSettings("owner",db)).toMatchObject({eventMode:"ALL_DAY",eventTime:null});
});
