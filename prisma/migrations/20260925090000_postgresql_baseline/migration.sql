-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "emailVerified" TIMESTAMP(3),
    "image" TEXT,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserPreferences" (
    "userId" TEXT NOT NULL,
    "agendaMonths" INTEGER NOT NULL DEFAULT 1,
    "timeZone" TEXT NOT NULL DEFAULT 'Europe/Amsterdam',

    CONSTRAINT "UserPreferences_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "refresh_token_expires_in" INTEGER,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,
    "needsReauth" BOOLEAN NOT NULL DEFAULT false,
    "oauthClientConfigId" TEXT,
    "profileEmail" TEXT,
    "profileName" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "CalendarSettings" (
    "userId" TEXT NOT NULL,
    "calendarId" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "timeZone" TEXT NOT NULL,
    "accessRole" TEXT NOT NULL,
    "defaultRemindersJson" TEXT NOT NULL,
    "confirmedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CalendarSettings_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "Probe" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "calendarId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'prepared',
    "requestJson" TEXT NOT NULL,
    "readbackJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Probe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrackedShow" (
    "id" TEXT NOT NULL,
    "trying" BOOLEAN NOT NULL DEFAULT false,
    "userId" TEXT NOT NULL,
    "tvmazeId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "year" TEXT,
    "poster" TEXT,
    "bannerUrl" TEXT,
    "backgroundUrl" TEXT,
    "bannerNextCheckAt" TIMESTAMP(3),
    "platform" TEXT,
    "country" TEXT,
    "status" TEXT NOT NULL,
    "summaryText" TEXT,
    "genresJson" TEXT NOT NULL DEFAULT '[]',
    "runtimeMinutes" INTEGER,
    "lastAttemptAt" TIMESTAMP(3),
    "lastSuccessAt" TIMESTAMP(3),
    "lastError" TEXT,

    CONSTRAINT "TrackedShow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Episode" (
    "id" TEXT NOT NULL,
    "trackedShowId" TEXT NOT NULL,
    "sourceId" INTEGER NOT NULL,
    "title" TEXT,
    "season" INTEGER,
    "number" INTEGER,
    "airdate" TEXT,
    "sourceUrl" TEXT NOT NULL,
    "present" BOOLEAN NOT NULL DEFAULT true,
    "summaryText" TEXT,

    CONSTRAINT "Episode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarEventLink" (
    "id" TEXT NOT NULL,
    "episodeId" TEXT NOT NULL,
    "calendarId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'prepared',
    "desiredJson" TEXT NOT NULL,
    "confirmedDesiredHash" TEXT,
    "confirmedRemoteHash" TEXT,
    "lastDate" TEXT,

    CONSTRAINT "CalendarEventLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncRun" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'running',
    "resultJson" TEXT,

    CONSTRAINT "SyncRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OAuthClientConfig" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "clientSecret" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OAuthClientConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Installation" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "ownerId" TEXT,
    "activeAccountId" TEXT,
    "oauthClientConfigId" TEXT,
    "initialCalendarId" TEXT,

    CONSTRAINT "Installation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoogleConnectionAttempt" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT,
    "sessionHash" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "requiredScopesJson" TEXT NOT NULL DEFAULT '[]',
    "oauthClientConfigId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "accountId" TEXT,
    "providerAccountId" TEXT,
    "profileEmail" TEXT,
    "profileName" TEXT,
    "tokensJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GoogleConnectionAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarCreationAttempt" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "timeZone" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'sending',
    "calendarId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CalendarCreationAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LegacyImportRun" (
    "id" TEXT NOT NULL DEFAULT 'legacy-sqlite',
    "runId" TEXT NOT NULL,
    "manifestSha256" TEXT NOT NULL,
    "sourceSha256" TEXT NOT NULL,
    "schemaSignature" TEXT NOT NULL,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LegacyImportRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Account_userId_idx" ON "Account"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- CreateIndex
CREATE UNIQUE INDEX "Probe_eventId_key" ON "Probe"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "Probe_userId_date_key" ON "Probe"("userId", "date");

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

-- CreateIndex
CREATE UNIQUE INDEX "Installation_ownerId_key" ON "Installation"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "Installation_activeAccountId_key" ON "Installation"("activeAccountId");

-- CreateIndex
CREATE INDEX "GoogleConnectionAttempt_ownerId_createdAt_idx" ON "GoogleConnectionAttempt"("ownerId", "createdAt");

-- CreateIndex
CREATE INDEX "CalendarCreationAttempt_ownerId_createdAt_idx" ON "CalendarCreationAttempt"("ownerId", "createdAt");

-- AddForeignKey
ALTER TABLE "UserPreferences" ADD CONSTRAINT "UserPreferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_oauthClientConfigId_fkey" FOREIGN KEY ("oauthClientConfigId") REFERENCES "OAuthClientConfig"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarSettings" ADD CONSTRAINT "CalendarSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Probe" ADD CONSTRAINT "Probe_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackedShow" ADD CONSTRAINT "TrackedShow_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Episode" ADD CONSTRAINT "Episode_trackedShowId_fkey" FOREIGN KEY ("trackedShowId") REFERENCES "TrackedShow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEventLink" ADD CONSTRAINT "CalendarEventLink_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "Episode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncRun" ADD CONSTRAINT "SyncRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Installation" ADD CONSTRAINT "Installation_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Installation" ADD CONSTRAINT "Installation_activeAccountId_fkey" FOREIGN KEY ("activeAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Installation" ADD CONSTRAINT "Installation_oauthClientConfigId_fkey" FOREIGN KEY ("oauthClientConfigId") REFERENCES "OAuthClientConfig"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoogleConnectionAttempt" ADD CONSTRAINT "GoogleConnectionAttempt_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoogleConnectionAttempt" ADD CONSTRAINT "GoogleConnectionAttempt_oauthClientConfigId_fkey" FOREIGN KEY ("oauthClientConfigId") REFERENCES "OAuthClientConfig"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarCreationAttempt" ADD CONSTRAINT "CalendarCreationAttempt_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

