import { database } from "./db";
import { GoogleCalendar } from "./google-calendar";
import { getGoogleAccessToken } from "./google-tokens";
import { CalendarProbeService } from "./calendar-probe";
import { CalendarSettingsService } from "./calendar-settings";
import { SyncService } from "./sync";
import { TVmaze } from "./tvmaze";
import { ownerInstallation } from "./installation";
import { getPreferences } from "./preferences";

export function googleForAccount(accountId: string) {
  return new GoogleCalendar(() => getGoogleAccessToken(database(), accountId));
}
function activeGoogle(userId: string) {
  return new GoogleCalendar(async () => getGoogleAccessToken(database(), (await ownerInstallation(database(), userId)).activeAccountId));
}
// Call only from inside the owner mutation lock, after any previous configuration change.
async function currentSettings(userId: string) {
  const db = database(), installation = await ownerInstallation(db, userId);
  const [preferences, calendar] = await Promise.all([getPreferences(userId, db), db.calendarSettings.findUnique({ where: { userId } })]);
  return { calendarId: calendar?.calendarId ?? installation.initialCalendarId ?? "", timeZone: preferences.timeZone };
}
export function probeService(userId: string) {
  return new CalendarProbeService(database(), activeGoogle(userId), () => currentSettings(userId));
}
export function syncService(userId: string) {
  return new SyncService(database(), activeGoogle(userId), new TVmaze(), () => currentSettings(userId));
}
export function calendarSettingsService() { return new CalendarSettingsService(database(), googleForAccount); }
