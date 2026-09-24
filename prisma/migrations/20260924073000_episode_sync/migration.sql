-- CreateTable
CREATE TABLE "TrackedShow" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "tvmazeId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "year" TEXT,
    "poster" TEXT,
    "platform" TEXT,
    "country" TEXT,
    "status" TEXT NOT NULL,
    "lastAttemptAt" DATETIME,
    "lastSuccessAt" DATETIME,
    "lastError" TEXT,
    CONSTRAINT "TrackedShow_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Episode" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "trackedShowId" TEXT NOT NULL,
    "sourceId" INTEGER NOT NULL,
    "title" TEXT,
    "season" INTEGER,
    "number" INTEGER,
    "airdate" TEXT,
    "sourceUrl" TEXT NOT NULL,
    "present" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "Episode_trackedShowId_fkey" FOREIGN KEY ("trackedShowId") REFERENCES "TrackedShow" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CalendarEventLink" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "episodeId" TEXT NOT NULL,
    "calendarId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'prepared',
    "desiredJson" TEXT NOT NULL,
    "confirmedDesiredHash" TEXT,
    "confirmedRemoteHash" TEXT,
    "lastDate" TEXT,
    CONSTRAINT "CalendarEventLink_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "Episode" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SyncRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'running',
    "resultJson" TEXT,
    CONSTRAINT "SyncRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "TrackedShow_userId_tvmazeId_key" ON "TrackedShow"("userId", "tvmazeId");

-- CreateIndex
CREATE UNIQUE INDEX "Episode_trackedShowId_sourceId_key" ON "Episode"("trackedShowId", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarEventLink_eventId_key" ON "CalendarEventLink"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarEventLink_episodeId_calendarId_key" ON "CalendarEventLink"("episodeId", "calendarId");

-- CreateIndex
CREATE INDEX "SyncRun_userId_startedAt_idx" ON "SyncRun"("userId", "startedAt");
