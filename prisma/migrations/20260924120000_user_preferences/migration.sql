CREATE TABLE "UserPreferences" (
    "userId" TEXT NOT NULL PRIMARY KEY,
    "agendaMonths" INTEGER NOT NULL DEFAULT 1 CHECK ("agendaMonths" IN (1, 2, 3)),
    "timeZone" TEXT NOT NULL DEFAULT 'Europe/Amsterdam',
    CONSTRAINT "UserPreferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
