ALTER TABLE "TrackedShow" ADD COLUMN "summaryText" TEXT;
ALTER TABLE "TrackedShow" ADD COLUMN "genresJson" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "TrackedShow" ADD COLUMN "runtimeMinutes" INTEGER;
ALTER TABLE "Episode" ADD COLUMN "summaryText" TEXT;
