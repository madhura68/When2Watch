"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CalendarInfo } from "@/server/google-calendar";
import type { userSettings } from "@/server/installation";

type Settings = Awaited<ReturnType<typeof userSettings>>;
type Match = { id: string; summary: string; reusable: boolean };
export function CalendarPanel({ settings }: { settings: Settings }) {
  const router = useRouter(), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const [calendars, setCalendars] = useState<CalendarInfo[]>([]), [matches, setMatches] = useState<Match[] | null>(null);
  const [name, setName] = useState("When2Watch"), [timeZone, setTimeZone] = useState(settings.preferences.timeZone), [acknowledged, setAcknowledged] = useState(false);
  async function request(path: string, payload?: object) {
    const response = await fetch(path, payload ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) } : undefined);
    const body = await response.json(); if (!response.ok) throw new Error(body.error ?? "This action failed."); return body;
  }
  async function run(work: () => Promise<string>) {
    setBusy(true); setMessage("");
    try { setMessage(await work()); } catch (error) { setMessage(error instanceof Error ? error.message : "Connection interrupted. Refresh the list before creating another calendar."); }
    finally { router.refresh(); setBusy(false); }
  }
  const current = settings.calendar, paused = current && current.state !== "ok", ready = settings.calendarPermission && !settings.needsReauth;
  const pending = settings.calendarCreation && ["sending", "uncertain"].includes(settings.calendarCreation.status) ? settings.calendarCreation : null;
  const checkName = () => run(async () => {
    const body = await request(`/api/settings/calendars?name=${encodeURIComponent(name)}`); setMatches(body.matches);
    return body.matches.length ? "A calendar with this name already exists. You cannot connect a calendar that When2Watch did not create; choose another name." : "This name is available.";
  });
  const create = () => run(async () => {
    const body = await request("/api/settings/calendars", { requestId: crypto.randomUUID(), name, timeZone });
    setCalendars(previous => [...previous.filter(c => c.id !== body.calendar.id), body.calendar]);
    return current ? "The new calendar has been created. Deliberately switch to it below." : "The new calendar has been created, read back, and selected.";
  });
  const choose = (id: string) => run(async () => {
    await request("/api/settings/calendar", current && current.id !== id ? { calendarId: id, switch: true, acknowledgeOldItems: acknowledged } : { calendarId: id });
    return "The calendar has been selected. New events will be added to it from now on.";
  });
  const list = () => run(async () => { const body = await request("/api/settings/calendars"); setCalendars(body.calendars); return body.calendars.length ? "These are your When2Watch calendars." : "You do not have a calendar created by When2Watch yet."; });
  return <section className="card settings-form" id="calendar"><h2>Your Google Calendar</h2>
    {current ? <p className={`notice ${paused ? "error" : "success"}`}><strong>{current.name}</strong> · {current.timeZone}<br /><span className="calendar-id">{current.id}</span></p>
      : <p>Create a separate calendar for When2Watch. Until then, you can follow series and view them locally.</p>}
    {current?.state === "legacy" && <p className="notice error">This calendar was not created by When2Watch. With limited Google permissions, When2Watch can no longer update it; syncing is paused. Your series and overview remain visible. Create a new When2Watch calendar and deliberately switch to it.</p>}
    {current?.state === "permission" && <p className="notice error">Syncing is paused: grant access to the calendar list and your When2Watch calendar again through your Google account.</p>}
    {current && current.timeZone !== settings.preferences.timeZone && <p className="notice">Your Google Calendar uses {current.timeZone}; When2Watch uses {settings.preferences.timeZone}. All-day events keep their release date; timed events use the When2Watch time zone. Check notification times in your calendar app.</p>}
    {!ready && <p><a href="#google">Grant the required Google Calendar access first.</a></p>}
    {pending && <p className="notice">Creating “{pending.name}” has not been confirmed. When2Watch will not create it again or connect anything by name.
      <button disabled={busy} onClick={() => void run(async () => { await request("/api/settings/calendars", { action: "abandon", requestId: pending.id }); return "Request released. Choose a different name for a new calendar."; })}>Release request</button></p>}
    {(!current || paused) && ready && <>
      <form onSubmit={event => { event.preventDefault(); void create(); }}>
        <label htmlFor="calendar-name">Name of the new calendar (1–100 characters)</label>
        <input id="calendar-name" value={name} maxLength={100} required disabled={busy} onChange={event => { setName(event.target.value); setMatches(null); }} />
        <label htmlFor="calendar-zone">Time zone</label><input id="calendar-zone" value={timeZone} required disabled={busy} onChange={event => setTimeZone(event.target.value)} />
        <div className="form-row"><button type="button" disabled={busy} onClick={() => void checkName()}>Check name</button>
          <button disabled={busy || !!pending || !!matches?.some(m => !m.reusable)}>Create calendar</button></div>
      </form>
      {matches?.filter(m => m.reusable).map(m => <p key={m.id}>Your previous When2Watch calendar “{m.summary}” <button disabled={busy} onClick={() => void choose(m.id)}>Use this one</button></p>)}
      <button disabled={busy} onClick={() => void list()}>Show my When2Watch calendars</button>
      {current && <label className="checkbox"><input type="checkbox" checked={acknowledged} onChange={event => setAcknowledged(event.target.checked)} /> I understand that existing events will remain in the old calendar and may appear twice. When2Watch does not move or delete them.</label>}
      {calendars.filter(c => c.id !== current?.id).map(c => <p key={c.id}>{c.summary} · {c.timeZone} <button disabled={busy || (!!current && !acknowledged)} onClick={() => void choose(c.id)}>{current ? "Switch to this calendar" : "Choose this calendar"}</button></p>)}
    </>}
    <div role="status">{message && <p className="notice">{message}</p>}</div>
  </section>;
}
