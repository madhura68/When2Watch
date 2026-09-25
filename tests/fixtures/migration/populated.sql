-- Synthetic legacy SQLite content for the IDEA-219 importer. No real users, tokens or events.
-- Covers all 15 application models, Unicode, null vs empty string, DST edges,
-- both SQLite DateTime storages (Prisma integer milliseconds and CURRENT_TIMESTAMP text)
-- and pending (uncertain) intentions.
INSERT INTO "User"(id,name,email,emailVerified,image) VALUES
  ('owner','Ëigenaar — 測試 🎬','owner@example.test',1774746000000,NULL),
  ('other','', NULL, NULL, '');
INSERT INTO "OAuthClientConfig"(id,clientId,clientSecret,createdAt) VALUES
  ('client','synthetic.apps.googleusercontent.com','synthetic-client-secret','2026-09-24 12:00:00');
INSERT INTO "Account"(id,userId,type,provider,providerAccountId,refresh_token,refresh_token_expires_in,access_token,expires_at,token_type,scope,id_token,session_state,needsReauth,oauthClientConfigId,profileEmail,profileName) VALUES
  ('account','owner','oauth','google','subject-owner','synthetic-refresh',604799,'synthetic-access',1790237300,'Bearer','openid email https://www.googleapis.com/auth/calendar.events',NULL,NULL,0,'client','owner@example.test','Ëigenaar'),
  ('account-2','other','oauth','google','subject-other',NULL,NULL,NULL,NULL,NULL,'',NULL,'',1,NULL,NULL,NULL);
INSERT INTO "Session"(id,sessionToken,userId,expires) VALUES
  ('session','synthetic-session-token','owner',1792576799999);
INSERT INTO "VerificationToken"(identifier,token,expires) VALUES
  ('owner@example.test','synthetic-verification',1792889999000);
INSERT INTO "UserPreferences"(userId,agendaMonths,timeZone) VALUES ('owner',3,'America/Los_Angeles');
INSERT INTO "CalendarSettings"(userId,calendarId,summary,timeZone,accessRole,defaultRemindersJson,confirmedAt) VALUES
  ('owner','chosen@group.calendar.google.com','When2Watch','Europe/Amsterdam','owner','[{"method":"popup","minutes":900}]','2026-09-23 18:29:50');
INSERT INTO "Probe"(id,userId,calendarId,eventId,date,status,requestJson,readbackJson,createdAt,updatedAt) VALUES
  ('probe','owner','chosen@group.calendar.google.com','probeevent0001','2026-09-24','confirmed','{ "b": 1, "a": [ ] }',NULL,1774745999999,1774746000000);
INSERT INTO "TrackedShow"(id,trying,userId,tvmazeId,title,sourceUrl,year,poster,bannerUrl,backgroundUrl,bannerNextCheckAt,platform,country,status,summaryText,genresJson,runtimeMinutes,lastAttemptAt,lastSuccessAt,lastError) VALUES
  ('show','1','owner',45039,'Slow Horses','https://www.tvmaze.com/shows/45039','2022',NULL,NULL,NULL,1792890000000,'Apple TV+','','Running','Spionnen — „café” ✓','["Drama","Thriller"]',50,1792889999999,1792890000000,NULL),
  ('show-2',0,'other',44776,'Lanterns','https://www.tvmaze.com/shows/44776',NULL,'',NULL,NULL,NULL,NULL,NULL,'In Development',NULL,'[]',NULL,NULL,NULL,'');
INSERT INTO "Episode"(id,trackedShowId,sourceId,title,season,number,airdate,sourceUrl,present,summaryText) VALUES
  ('episode','show',3643507,'Resurrection',6,3,'2026-09-30','https://www.tvmaze.com/episodes/3643507',1,''),
  ('episode-2','show',3643508,NULL,NULL,NULL,NULL,'https://www.tvmaze.com/episodes/3643508',0,NULL),
  ('episode-3','show-2',9000001,'Ünïcode 🎞','1',NULL,'2026-10-25','https://www.tvmaze.com/episodes/9000001','true',NULL);
INSERT INTO "CalendarEventLink"(id,episodeId,calendarId,eventId,status,desiredJson,confirmedDesiredHash,confirmedRemoteHash,lastDate) VALUES
  ('link','episode','chosen@group.calendar.google.com','ee23b19691f4d45fcb29c0d48078f50b7','synced','{"summary":"Slow Horses S06E03","start":{"date":"2026-09-30"}}','desired-hash','remote-hash','2026-09-30'),
  ('link-pending','episode-2','chosen@group.calendar.google.com','ee23b19691f4d45fcb29c0d48078f50b8','sending','{"summary":"pending"}',NULL,NULL,NULL);
INSERT INTO "SyncRun"(id,userId,trigger,startedAt,finishedAt,status,resultJson) VALUES
  ('run','owner','cron','2026-10-25 00:59:59',1792889999999,'success','{"created":5}'),
  ('run-open','owner','manual',1774746000000,NULL,'running',NULL);
INSERT INTO "Installation"(id,ownerId,activeAccountId,oauthClientConfigId,initialCalendarId) VALUES
  ('singleton','owner','account','client','chosen@group.calendar.google.com');
INSERT INTO "GoogleConnectionAttempt"(id,ownerId,sessionHash,mode,requiredScopesJson,oauthClientConfigId,status,expiresAt,accountId,providerAccountId,profileEmail,profileName,tokensJson,createdAt) VALUES
  ('attempt','owner','session-hash','calendar','["https://www.googleapis.com/auth/calendar.events"]','client','pending',1792890900000,NULL,NULL,NULL,NULL,'{"refresh_token":"synthetic-pending-refresh"}','2026-09-24 12:10:00.123');
INSERT INTO "CalendarCreationAttempt"(id,ownerId,accountId,name,timeZone,status,calendarId,createdAt) VALUES
  ('creation','owner','account','When2Watch','Europe/Amsterdam','sending',NULL,1774746000000);
