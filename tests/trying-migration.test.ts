import { expect, it } from "vitest";
import { legacySqliteDatabase } from "./database";

// Archived SQLite history: the old release stays a runnable rollback basis.
it("adds trying to populated SQLite while preserving episodes and Calendar identities", ()=>{
  const migration="20260924200000_series_trying", legacy=legacySqliteDatabase(migration);
  try {
    legacy.sqlite.exec(`INSERT INTO User(id,email) VALUES ('owner','owner@example.test')`);
    legacy.sqlite.exec(`INSERT INTO TrackedShow(id,userId,tvmazeId,title,sourceUrl,status) VALUES ('show','owner',45039,'Slow Horses','https://www.tvmaze.com/shows/45039','Running')`);
    legacy.sqlite.exec(`INSERT INTO Episode(id,trackedShowId,sourceId,airdate,sourceUrl) VALUES ('episode','show',3643507,'2026-09-30','https://www.tvmaze.com/episodes/3643507')`);
    legacy.sqlite.exec(`INSERT INTO CalendarEventLink(id,episodeId,calendarId,eventId,status,desiredJson,confirmedDesiredHash) VALUES ('link','episode','chosen@example.test','existing-event','synced','{}','existing-hash')`);
    const tables=["TrackedShow","Episode","CalendarEventLink"], before=Object.fromEntries(tables.map(t=>[t,legacy.all(`SELECT * FROM "${t}"`)]));
    legacy.applyMigration(migration);
    for(const table of tables){
      const columns=Object.keys(before[table][0]).map(c=>`"${c}"`).join(",");
      expect(legacy.all(`SELECT ${columns} FROM "${table}"`)).toEqual(before[table]);
    }
    expect(legacy.all(`SELECT trying FROM TrackedShow`)).toEqual([{trying:0}]);
  } finally {legacy.close();}
});
