-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'USER');

-- CreateEnum
CREATE TYPE "AccessStatus" AS ENUM ('ACTIVE', 'BLOCKED', 'UNCLAIMED');

-- CreateEnum
CREATE TYPE "BindingStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'LEGACY_UNRESOLVED');

-- CreateEnum
CREATE TYPE "BindingProvenance" AS ENUM ('APP_CREATED', 'LEGACY_UNVERIFIED');

-- DropIndex
DROP INDEX "CalendarEventLink_eventId_key";

-- DropIndex
DROP INDEX "Probe_eventId_key";

-- AlterTable
ALTER TABLE "CalendarEventLink" ADD COLUMN     "bindingId" TEXT,
ADD COLUMN     "catalogEpisodeId" TEXT,
ADD COLUMN     "userId" TEXT,
ALTER COLUMN "episodeId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Probe" ADD COLUMN     "bindingId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "accessStatus" "AccessStatus" NOT NULL DEFAULT 'UNCLAIMED',
ADD COLUMN     "role" "Role" NOT NULL DEFAULT 'USER';

-- CreateTable
CREATE TABLE "CatalogShow" (
    "id" TEXT NOT NULL,
    "tvmazeId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "year" TEXT,
    "poster" TEXT,
    "bannerUrl" TEXT,
    "backgroundUrl" TEXT,
    "artworkNextCheckAt" TIMESTAMP(3),
    "platform" TEXT,
    "country" TEXT,
    "status" TEXT NOT NULL,
    "summaryText" TEXT,
    "genresJson" TEXT NOT NULL DEFAULT '[]',
    "runtimeMinutes" INTEGER,
    "observedSourceUpdatedAt" INTEGER,
    "appliedSourceUpdatedAt" INTEGER,
    "lastFullCheckAt" TIMESTAMP(3),
    "lastAttemptAt" TIMESTAMP(3),
    "lastSuccessAt" TIMESTAMP(3),
    "lastError" TEXT,
    "needsReconcile" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "CatalogShow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogEpisode" (
    "id" TEXT NOT NULL,
    "catalogShowId" TEXT NOT NULL,
    "sourceId" INTEGER NOT NULL,
    "title" TEXT,
    "season" INTEGER,
    "number" INTEGER,
    "airdate" TEXT,
    "sourceUrl" TEXT NOT NULL,
    "present" BOOLEAN NOT NULL DEFAULT true,
    "summaryText" TEXT,

    CONSTRAINT "CatalogEpisode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserFollow" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "catalogShowId" TEXT NOT NULL,
    "trying" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastAttemptAt" TIMESTAMP(3),
    "lastSuccessAt" TIMESTAMP(3),
    "lastError" TEXT,

    CONSTRAINT "UserFollow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserConnection" (
    "userId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserConnection_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "CalendarBinding" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accountId" TEXT,
    "calendarId" TEXT NOT NULL,
    "status" "BindingStatus" NOT NULL,
    "provenance" "BindingProvenance" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "summary" TEXT,
    "timeZone" TEXT,
    "accessRole" TEXT,
    "defaultRemindersJson" TEXT,
    "confirmedAt" TIMESTAMP(3),

    CONSTRAINT "CalendarBinding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invitation" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "invitedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvitationFlow" (
    "id" TEXT NOT NULL,
    "invitationId" TEXT NOT NULL,
    "browserSecretHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvitationFlow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SearchCache" (
    "key" TEXT NOT NULL,
    "resultJson" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SearchCache_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "MigrationRun" (
    "id" TEXT NOT NULL,
    "phase" TEXT NOT NULL,
    "sourceChecksum" TEXT NOT NULL,
    "schemaVersion" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "reportJson" TEXT,

    CONSTRAINT "MigrationRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MigrationMap" (
    "runId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "oldId" TEXT NOT NULL,
    "newId" TEXT NOT NULL,

    CONSTRAINT "MigrationMap_pkey" PRIMARY KEY ("runId","kind","oldId")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actorId" TEXT,
    "targetId" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeletionTombstone" (
    "userId" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeletionTombstone_pkey" PRIMARY KEY ("userId")
);

-- CreateIndex
CREATE UNIQUE INDEX "CatalogShow_tvmazeId_key" ON "CatalogShow"("tvmazeId");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogEpisode_catalogShowId_sourceId_key" ON "CatalogEpisode"("catalogShowId", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "UserFollow_userId_catalogShowId_key" ON "UserFollow"("userId", "catalogShowId");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarBinding_id_userId_key" ON "CalendarBinding"("id", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarBinding_userId_calendarId_key" ON "CalendarBinding"("userId", "calendarId");

-- CreateIndex
CREATE UNIQUE INDEX "Invitation_tokenHash_key" ON "Invitation"("tokenHash");

-- CreateIndex
CREATE INDEX "Invitation_email_idx" ON "Invitation"("email");

-- CreateIndex
CREATE INDEX "AuditEvent_at_idx" ON "AuditEvent"("at");

-- CreateIndex
CREATE UNIQUE INDEX "Account_id_userId_key" ON "Account"("id", "userId");

-- CreateIndex
CREATE INDEX "CalendarEventLink_userId_idx" ON "CalendarEventLink"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarEventLink_calendarId_eventId_key" ON "CalendarEventLink"("calendarId", "eventId");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarEventLink_bindingId_catalogEpisodeId_key" ON "CalendarEventLink"("bindingId", "catalogEpisodeId");

-- CreateIndex
CREATE UNIQUE INDEX "Probe_calendarId_eventId_key" ON "Probe"("calendarId", "eventId");

-- AddForeignKey
ALTER TABLE "Probe" ADD CONSTRAINT "Probe_bindingId_userId_fkey" FOREIGN KEY ("bindingId", "userId") REFERENCES "CalendarBinding"("id", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEventLink" ADD CONSTRAINT "CalendarEventLink_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEventLink" ADD CONSTRAINT "CalendarEventLink_bindingId_userId_fkey" FOREIGN KEY ("bindingId", "userId") REFERENCES "CalendarBinding"("id", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEventLink" ADD CONSTRAINT "CalendarEventLink_catalogEpisodeId_fkey" FOREIGN KEY ("catalogEpisodeId") REFERENCES "CatalogEpisode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogEpisode" ADD CONSTRAINT "CatalogEpisode_catalogShowId_fkey" FOREIGN KEY ("catalogShowId") REFERENCES "CatalogShow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserFollow" ADD CONSTRAINT "UserFollow_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserFollow" ADD CONSTRAINT "UserFollow_catalogShowId_fkey" FOREIGN KEY ("catalogShowId") REFERENCES "CatalogShow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserConnection" ADD CONSTRAINT "UserConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserConnection" ADD CONSTRAINT "UserConnection_accountId_userId_fkey" FOREIGN KEY ("accountId", "userId") REFERENCES "Account"("id", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarBinding" ADD CONSTRAINT "CalendarBinding_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarBinding" ADD CONSTRAINT "CalendarBinding_accountId_userId_fkey" FOREIGN KEY ("accountId", "userId") REFERENCES "Account"("id", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvitationFlow" ADD CONSTRAINT "InvitationFlow_invitationId_fkey" FOREIGN KEY ("invitationId") REFERENCES "Invitation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MigrationMap" ADD CONSTRAINT "MigrationMap_runId_fkey" FOREIGN KEY ("runId") REFERENCES "MigrationRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;



-- IDEA-219: constraints Prisma 6 cannot express. Guarded by tests/migration/catalog-backfill.test.ts
-- (pg_catalog invariants after the whole `migrate deploy` chain); later migrations must keep them.
-- At most one active calendar per user.
CREATE UNIQUE INDEX "CalendarBinding_one_active_per_user" ON "CalendarBinding"("userId") WHERE "status" = 'ACTIVE';
-- Only an unresolved legacy binding may lack a proven account.
ALTER TABLE "CalendarBinding" ADD CONSTRAINT "CalendarBinding_account_required" CHECK ("accountId" IS NOT NULL OR "status" = 'LEGACY_UNRESOLVED');
-- A composite FK is skipped when one column is NULL (MATCH SIMPLE): ownership columns are all-or-nothing.
ALTER TABLE "CalendarEventLink" ADD CONSTRAINT "CalendarEventLink_ownership_complete" CHECK (
  ("bindingId" IS NULL AND "catalogEpisodeId" IS NULL) OR ("userId" IS NOT NULL AND "bindingId" IS NOT NULL AND "catalogEpisodeId" IS NOT NULL));
-- Every link is anchored either to a legacy episode or to a shared catalog episode.
ALTER TABLE "CalendarEventLink" ADD CONSTRAINT "CalendarEventLink_has_episode" CHECK ("episodeId" IS NOT NULL OR "catalogEpisodeId" IS NOT NULL);
