import { database } from "./db";
import { config } from "./config";
import { GoogleCalendar } from "./google-calendar";
import { getGoogleAccessToken, googleTokenRefresher } from "./google-tokens";
import { CalendarProbeService } from "./calendar-probe";
import { SyncService } from "./sync";
import { TVmaze } from "./tvmaze";

export function probeService(userId: string) {
  const settings = config();
  const db = database();
  const google = new GoogleCalendar(() => getGoogleAccessToken(db, userId, googleTokenRefresher(settings.clientId, settings.clientSecret)));
  return new CalendarProbeService(db, google, settings);
}

export function syncService(userId: string) {
  const settings = config(), db = database();
  const google = new GoogleCalendar(() => getGoogleAccessToken(db,userId,googleTokenRefresher(settings.clientId,settings.clientSecret)));
  return new SyncService(db,google,new TVmaze(),settings);
}
