"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { Preferences, EventMode } from "@/server/preferences";

export function PreferencesPanel({ preferences, invalidTimeZone }: { preferences: Preferences; invalidTimeZone: boolean }) {
  const router = useRouter();
  const [timeZone, setTimeZone] = useState(preferences.timeZone);
  const [months, setMonths] = useState(String(preferences.agendaMonths));
  const [eventMode, setEventMode] = useState<EventMode>(preferences.eventMode);
  const [eventTime, setEventTime] = useState(preferences.eventTime ?? "20:00");
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [failed, setFailed] = useState(false);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage(""); setFailed(false);
    try {
      const response = await fetch("/api/settings/preferences", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ agendaMonths: Number(months), timeZone, eventMode, eventTime }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Saving failed.");
      setMessage("Your preferences have been saved."); router.refresh();
    } catch (error) { setFailed(true); setMessage(error instanceof Error ? error.message : "Connection interrupted. Try again."); }
    finally { setBusy(false); }
  }
  return <section id="preferences" className="card settings-form">
    <h2>Your calendar overview</h2><p className="muted">Choose how far ahead you want to look.</p>
    <form onSubmit={save} aria-busy={busy}>
      <label htmlFor="agenda-months">Period from today</label>
      <select id="agenda-months" value={months} onChange={event => setMonths(event.target.value)} disabled={busy}>
        <option value="1">One month</option><option value="2">Two months</option><option value="3">Three months</option>
      </select>
      <label htmlFor="preference-zone">Time zone</label><input id="preference-zone" value={timeZone} onChange={event => setTimeZone(event.target.value)} required disabled={busy} list="timezones" /><datalist id="timezones"><option value="Europe/Amsterdam"/><option value="Europe/London"/><option value="America/New_York"/><option value="UTC"/></datalist>
      <fieldset disabled={busy}><legend>Event style</legend>
        <label><input type="radio" name="event-mode" checked={eventMode === "ALL_DAY"} onChange={() => setEventMode("ALL_DAY")} /> All-day</label>
        <label><input type="radio" name="event-mode" checked={eventMode === "FIXED_TIME"} onChange={() => setEventMode("FIXED_TIME")} /> Fixed time</label>
        {eventMode === "FIXED_TIME" && <label>Time <input type="time" value={eventTime} step={60} required onChange={e => setEventTime(e.target.value)} /></label>}
      </fieldset>
      {invalidTimeZone && <p role="alert" className="notice error">Your saved time zone is not a valid IANA name; choose one from the list.</p>}
      <p className="muted small">Changing the event style rewrites your upcoming events on the next sync. Reminders follow your Google Calendar settings; timed events use the calendar's default notification for events, all-day events the one for all-day events.</p>
      <p className="muted small">The period determines how far ahead you look here. The time zone determines what When2Watch considers today. Set notifications for all-day events in your calendar app.</p>
      <button className="primary" disabled={busy || (Number(months) === preferences.agendaMonths && timeZone === preferences.timeZone && eventMode === preferences.eventMode && eventTime === (preferences.eventTime ?? "20:00"))}>{busy ? "Saving…" : "Save"}</button>
      <div role="status">{message && <p className={`notice ${failed ? "error" : "success"}`}>{message}</p>}</div>
    </form>
  </section>;
}
