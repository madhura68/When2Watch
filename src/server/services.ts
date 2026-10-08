import { database } from "./db";
import { GoogleCalendar } from "./google-calendar";
import { getGoogleAccessToken } from "./google-tokens";
import { CalendarProbeService } from "./calendar-probe";
import { CalendarSettingsService } from "./calendar-settings";
import { SyncService } from "./sync";
import { TVmaze } from "./tvmaze";
import { getActiveBinding } from "./calendar-bindings";
import { loadSyncSettings } from "./sync-settings";
import { config } from "./config";
import { AppError } from "./errors";

export function googleForAccount(accountId: string) {
  return new GoogleCalendar(() => getGoogleAccessToken(database(), accountId));
}
/** Calendar access always uses the account of the user's own active binding, resolved at call time. */
function bindingGoogle(userId: string) {
  return new GoogleCalendar(async () => {
    const active = await getActiveBinding(database(), userId);
    if (!("binding" in active)) throw new AppError("CALENDAR_UNCONFIGURED", 409, "Choose your own calendar in Settings first.");
    return getGoogleAccessToken(database(), active.account.id);
  });
}
const settingsFor = (userId: string) => async () => ({ ...await loadSyncSettings(userId, database()), origin: config().origin });
export function probeService(userId: string) {
  return new CalendarProbeService(database(), bindingGoogle(userId), settingsFor(userId));
}
export function syncService(userId: string) {
  return new SyncService(database(), bindingGoogle(userId), new TVmaze(), settingsFor(userId));
}
export function calendarSettingsService() { return new CalendarSettingsService(database(), googleForAccount); }
