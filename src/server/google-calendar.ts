import { AppError } from "./errors";

export type Reminder = { method: "popup" | "email"; minutes: number };
export type CalendarInfo = {
  id: string; summary: string; timeZone: string; accessRole: string; defaultReminders: Reminder[];
};
export type CalendarEvent = {
  id: string;
  summary?: string;
  description?: string;
  status?: string;
  etag?: string;
  transparency?: "transparent" | "opaque";
  start: { date?: string; dateTime?: string };
  end: { date?: string; dateTime?: string };
  reminders: { useDefault: boolean; overrides?: Reminder[] };
  extendedProperties?: { private?: Record<string, string> };
};

export class GoogleCalendar {
  constructor(private readonly token: () => Promise<string>, private readonly fetcher: typeof fetch = fetch) {}

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const accessToken = await this.token();
    let response: Response;
    try {
      response = await this.fetcher(`https://www.googleapis.com/calendar/v3/${path}`, {
        ...init,
        headers: { "Content-Type": "application/json", ...init.headers, Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      throw new AppError("GOOGLE_UNAVAILABLE", 503, "Google gaf geen antwoord. Probeer dezelfde actie opnieuw; het proefitem wordt niet dubbel aangemaakt.");
    }
    if (!response.ok) {
      const codes: Record<number, [string, string]> = {
        401: ["RECONNECT_GOOGLE", "Koppel Google opnieuw om verder te gaan."],
        403: ["CALENDAR_FORBIDDEN", "Google weigert deze agenda-actie. Controleer de toestemming en probeer opnieuw."],
        404: ["NOT_FOUND", "De gekozen agenda of het proefitem is niet gevonden."],
        409: ["CONFLICT", "Dit agenda-item bestaat al."],
        410: ["GONE", "Dit agenda-item is verwijderd."],
        412: ["EVENT_CHANGED", "Het proefitem is intussen gewijzigd. Controleer het en probeer opnieuw."],
      };
      const [code, message] = codes[response.status] ?? ["GOOGLE_UNAVAILABLE", "Google kan deze actie nu niet uitvoeren. Probeer het later opnieuw."];
      throw new AppError(code, response.status, message);
    }
    if (response.status === 204) return undefined as T;
    try { return await response.json() as T; }
    catch { throw new AppError("INVALID_GOOGLE_RESPONSE", 502, "Google gaf een onleesbaar antwoord. Probeer opnieuw."); }
  }

  async calendar(calendarId: string): Promise<CalendarInfo> {
    const result = await this.request<CalendarInfo>(`users/me/calendarList/${encodeURIComponent(calendarId)}`);
    if (result.id !== calendarId) throw new AppError("WRONG_CALENDAR", 409, "Google gaf een andere agenda terug. Er wordt niets geschreven.");
    if (!["owner", "writer"].includes(result.accessRole)) {
      throw new AppError("CALENDAR_NOT_WRITABLE", 403, "Je hebt geen schrijfrechten voor de gekozen agenda.");
    }
    return {
      id: result.id, summary: result.summary, timeZone: result.timeZone, accessRole: result.accessRole,
      defaultReminders: (result.defaultReminders ?? []).map(({ method, minutes }) => ({ method, minutes })),
    };
  }

  event(calendarId: string, eventId: string): Promise<CalendarEvent> {
    return this.request(`calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`);
  }

  insert(calendarId: string, event: CalendarEvent): Promise<CalendarEvent> {
    return this.request(`calendars/${encodeURIComponent(calendarId)}/events?sendUpdates=none`, { method: "POST", body: JSON.stringify(event) });
  }

  async ownedEpisodes(calendarId: string, userId: string, showId: number): Promise<CalendarEvent[]> {
    const events: CalendarEvent[] = [], seen = new Set<string>();
    let pageToken: string | undefined;
    do {
      const query = new URLSearchParams({ maxResults: "2500", showDeleted: "false" });
      // Repeated private properties are ORed by Google. Fetch app candidates,
      // then check the full identity locally (developers.google.com/calendar/api/guides/extended-properties).
      query.append("privateExtendedProperty", "app=when2watch");
      if (pageToken) query.set("pageToken", pageToken);
      const result = await this.request<{ items?: CalendarEvent[]; nextPageToken?: string }>(`calendars/${encodeURIComponent(calendarId)}/events?${query}`);
      if (result.items !== undefined && !Array.isArray(result.items)) throw new AppError("INVALID_GOOGLE_RESPONSE", 502, "Google gaf geen geldige lijst agenda-items.");
      events.push(...(result.items ?? []));
      pageToken = result.nextPageToken;
      if (pageToken && (typeof pageToken !== "string" || seen.has(pageToken))) throw new AppError("INVALID_GOOGLE_RESPONSE", 502, "De lijst agenda-items kon niet volledig worden gelezen.");
      if (pageToken) seen.add(pageToken);
    } while (pageToken);
    return events.filter(event => Object.entries({ app:"when2watch",kind:"episode",userId,showId:String(showId) })
      .every(([key,value]) => event.extendedProperties?.private?.[key] === value));
  }

  patch(calendarId: string, eventId: string, event: CalendarEvent, etag: string): Promise<CalendarEvent> {
    return this.request(`calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}?sendUpdates=none`, {
      method: "PATCH", headers: { "If-Match": etag }, body: JSON.stringify(event),
    });
  }

  remove(calendarId: string, eventId: string, etag: string): Promise<void> {
    return this.request(`calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}?sendUpdates=none`, {
      method: "DELETE", headers: { "If-Match": etag },
    });
  }
}

export function safeEvent(event: CalendarEvent): CalendarEvent {
  return {
    id: event.id, summary: event.summary, description: event.description, transparency: event.transparency, status: event.status, etag: event.etag,
    start: event.start, end: event.end, reminders: event.reminders,
    extendedProperties: event.extendedProperties,
  };
}
