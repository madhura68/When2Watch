-- Google returns this optional lifetime for time-limited OAuth consent.
ALTER TABLE "Account" ADD COLUMN "refresh_token_expires_in" INTEGER;
