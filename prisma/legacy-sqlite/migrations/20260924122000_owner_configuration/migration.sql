CREATE TABLE "OAuthClientConfig" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "clientId" TEXT NOT NULL,
  "clientSecret" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE "Account" ADD COLUMN "oauthClientConfigId" TEXT REFERENCES "OAuthClientConfig"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Account" ADD COLUMN "profileEmail" TEXT;
ALTER TABLE "Account" ADD COLUMN "profileName" TEXT;
CREATE TABLE "Installation" (
  "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'singleton',
  "ownerId" TEXT,
  "activeAccountId" TEXT,
  "oauthClientConfigId" TEXT,
  "initialCalendarId" TEXT,
  CONSTRAINT "Installation_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Installation_activeAccountId_fkey" FOREIGN KEY ("activeAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Installation_oauthClientConfigId_fkey" FOREIGN KEY ("oauthClientConfigId") REFERENCES "OAuthClientConfig"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Installation_ownerId_key" ON "Installation"("ownerId");
CREATE UNIQUE INDEX "Installation_activeAccountId_key" ON "Installation"("activeAccountId");
CREATE TABLE "GoogleConnectionAttempt" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "ownerId" TEXT,
  "sessionHash" TEXT NOT NULL,
  "mode" TEXT NOT NULL,
  "requiredScopesJson" TEXT NOT NULL DEFAULT '[]',
  "oauthClientConfigId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "expiresAt" DATETIME NOT NULL,
  "accountId" TEXT,
  "providerAccountId" TEXT,
  "profileEmail" TEXT,
  "profileName" TEXT,
  "tokensJson" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GoogleConnectionAttempt_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "GoogleConnectionAttempt_oauthClientConfigId_fkey" FOREIGN KEY ("oauthClientConfigId") REFERENCES "OAuthClientConfig"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "GoogleConnectionAttempt_ownerId_createdAt_idx" ON "GoogleConnectionAttempt"("ownerId", "createdAt");
CREATE TABLE "CalendarCreationAttempt" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "ownerId" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "timeZone" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'sending',
  "calendarId" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CalendarCreationAttempt_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "CalendarCreationAttempt_ownerId_createdAt_idx" ON "CalendarCreationAttempt"("ownerId", "createdAt");
