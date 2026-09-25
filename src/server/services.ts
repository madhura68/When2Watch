import { database } from "./db";
import { GoogleCalendar } from "./google-calendar";
import { getGoogleAccessToken } from "./google-tokens";
import { CalendarProbeService } from "./calendar-probe";
import { CalendarSettingsService } from "./calendar-settings";
import { SyncService } from "./sync";
import { TVmaze } from "./tvmaze";
import { getActiveBinding } from "./calendar-bindings";
import { getPreferences } from "./preferences";
import { AppError } from "./errors";

export function googleForAccount(accountId: string) {
  return new GoogleCalendar(() => getGoogleAccessToken(database(), accountId));
}
/** Calendar access always uses the account of the user's own active binding, resolved at call time. */
function bindingGoogle(userId: string) {
  return new GoogleCalendar(async () => {
    const active = await getActiveBinding(database(), userId);
    if (!("binding" in active)) throw new AppError("CALENDAR_UNCONFIGURED", 409, "Kies eerst je eigen agenda bij Instellingen.");
    return getGoogleAccessToken(database(), active.account.id);
  });
}
// Call only from inside the user's mutation lock, after any previous configuration change.
async function currentSettings(userId: string) {
  const db = database(), [preferences, active] = await Promise.all([getPreferences(userId, db), getActiveBinding(db, userId)]);
  return { calendarId: "binding" in active ? active.binding.calendarId : "", timeZone: preferences.timeZone };
}
export function probeService(userId: string) {
  return new CalendarProbeService(database(), bindingGoogle(userId), () => currentSettings(userId));
}
export function syncService(userId: string) {
  return new SyncService(database(), bindingGoogle(userId), new TVmaze(), () => currentSettings(userId));
}
export function calendarSettingsService() { return new CalendarSettingsService(database(), googleForAccount); }
