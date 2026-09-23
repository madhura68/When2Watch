import { database } from "./db";
import { config } from "./config";
import { GoogleCalendar } from "./google-calendar";
import { getGoogleAccessToken, googleTokenRefresher } from "./google-tokens";
import { CalendarProbeService } from "./calendar-probe";

export function probeService(userId: string) {
  const settings = config();
  const db = database();
  const google = new GoogleCalendar(() => getGoogleAccessToken(db, userId, googleTokenRefresher(settings.clientId, settings.clientSecret)));
  return new CalendarProbeService(db, google, settings);
}
