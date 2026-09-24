import { expect, it } from "vitest";
import { testDatabase } from "./database";

it("adds trying to populated SQLite while preserving episodes and Calendar identities", async()=>{
  const migration="20260924200000_series_trying", storage=testDatabase(migration);
  try {
    await storage.db.$executeRawUnsafe(`INSERT INTO User(id,email) VALUES ('owner','owner@example.test')`);
    await storage.db.$executeRawUnsafe(`INSERT INTO TrackedShow(id,userId,tvmazeId,title,sourceUrl,status) VALUES ('show','owner',45039,'Slow Horses','https://www.tvmaze.com/shows/45039','Running')`);
    await storage.db.$executeRawUnsafe(`INSERT INTO Episode(id,trackedShowId,sourceId,airdate,sourceUrl) VALUES ('episode','show',3643507,'2026-09-30','https://www.tvmaze.com/episodes/3643507')`);
    await storage.db.$executeRawUnsafe(`INSERT INTO CalendarEventLink(id,episodeId,calendarId,eventId,status,desiredJson,confirmedDesiredHash) VALUES ('link','episode','chosen@example.test','existing-event','synced','{}','existing-hash')`);
    const beforeShow=await storage.db.$queryRawUnsafe<Record<string,unknown>[]>(`SELECT * FROM TrackedShow`);
    const episodes=await storage.db.episode.findMany(), links=await storage.db.calendarEventLink.findMany();
    storage.applyMigration(migration);
    const {trying,...afterShow}=await storage.db.trackedShow.findFirstOrThrow();
    expect(trying).toBe(false);
    // Read old columns through SQL so SQLite's date representation stays comparable.
    expect(await storage.db.$queryRawUnsafe(`SELECT ${Object.keys(beforeShow[0]).map(c=>'"'+c+'"').join(',')} FROM TrackedShow`)).toEqual(beforeShow);
    expect(afterShow.id).toBe("show");
    expect(await storage.db.episode.findMany()).toEqual(episodes);
    expect(await storage.db.calendarEventLink.findMany()).toEqual(links);
    await storage.db.trackedShow.update({where:{id:"show"},data:{trying:true}});
    const reopened=storage.reopen();
    try {expect((await reopened.trackedShow.findFirstOrThrow()).trying).toBe(true);} finally {await reopened.$disconnect();}
  } finally {await storage.close();}
});
