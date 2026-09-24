"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CalendarInfo } from "@/server/google-calendar";
import type { publicInstallation } from "@/server/installation";

type Settings = Awaited<ReturnType<typeof publicInstallation>>;
export function CalendarPanel({ settings }: { settings: Settings }) {
  const router = useRouter(), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const [calendars, setCalendars] = useState<CalendarInfo[]>([]), [id, setId] = useState(settings.calendar?.id ?? settings.initialCalendarId ?? "");
  const [name, setName] = useState("When2Watch"), [timeZone, setTimeZone] = useState(settings.preferences.timeZone);
  async function request(path: string, payload?: object) {
    const response = await fetch(path, payload ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) } : undefined);
    const body = await response.json(); if (!response.ok) throw new Error(body.error ?? "Deze actie is niet gelukt."); return body;
  }
  async function action(kind: "list" | "select" | "create") {
    setBusy(true); setMessage("");
    try {
      if (kind === "list") { const body = await request("/api/settings/calendars"); setCalendars(body.calendars); setMessage(body.calendars.length ? "Kies de bedoelde agenda op naam, tijdzone en ID." : "Google geeft nog geen schrijfbare agenda’s terug."); }
      if (kind === "select") { await request("/api/settings/calendar", { calendarId: id }); setMessage("De agenda is gecontroleerd en gekozen."); }
      if (kind === "create") { const body = await request("/api/settings/calendars", { requestId: crypto.randomUUID(), name, timeZone }); setId(body.calendar.id); setCalendars(previous => [...previous.filter(c => c.id !== body.calendar.id), body.calendar]); setMessage("De nieuwe agenda is aangemaakt en teruggelezen. Bevestig hieronder je keuze."); }
    } catch (error) { setMessage(error instanceof Error ? error.message : "Verbinding onderbroken. Vernieuw de lijst voordat je opnieuw een agenda aanmaakt."); }
    finally { router.refresh(); setBusy(false); }
  }
  const ready = settings.calendarPermission && !settings.needsReauth;
  return <section className="card settings-form" id="agenda-keuze"><h2>Je Google-agenda</h2>
    {settings.calendar ? <p className="notice success"><strong>{settings.calendar.name}</strong> · {settings.calendar.timeZone}<br /><span className="calendar-id">{settings.calendar.id}</span></p> : <p>Kies een bestaande schrijfbare agenda of maak een aparte agenda voor When2Watch aan. Tot die tijd kun je series volgen en lokaal bekijken.</p>}
    {settings.calendar && settings.calendar.timeZone !== settings.preferences.timeZone && <p className="notice">Je Google-agenda gebruikt {settings.calendar.timeZone}; When2Watch gebruikt {settings.preferences.timeZone}. Hele-dagafspraken behouden hun uitzenddatum. Controleer de meldingstijd in je agenda-app.</p>}
    {!ready && <p><a href="#google">Geef eerst de benodigde Google-agendatoegang.</a></p>}
    {!settings.calendar && <>
      <button disabled={busy || !ready} onClick={() => void action("list")}>Agendalijst vernieuwen</button>
      {calendars.length > 0 && <><label htmlFor="calendar-choice">Schrijfbare agenda’s</label><select id="calendar-choice" value={id} disabled={busy} onChange={event => setId(event.target.value)}><option value="">Kies een agenda</option>{calendars.map(c => <option key={c.id} value={c.id}>{c.summary} · {c.timeZone} · {c.id}</option>)}</select></>}
      <form onSubmit={event => { event.preventDefault(); void action("select"); }}><label htmlFor="calendar-id">Volledige agenda-ID</label><input id="calendar-id" value={id} onChange={event => setId(event.target.value)} required disabled={busy || !ready} /><button className="primary" disabled={busy || !ready || !id}>Agenda controleren en kiezen</button></form>
      {settings.calendarCreation && <p className="notice">Aanvraag “{settings.calendarCreation.name}”: {settings.calendarCreation.status === "ready" ? "aangemaakt en teruggelezen" : "nog niet bevestigd"}. Vernieuw de lijst en wijs de bedoelde agenda aan.{settings.calendarCreation.calendarId && <code className="calendar-id">{settings.calendarCreation.calendarId}</code>}</p>}
      <details><summary>Nieuwe agenda aanmaken</summary>{!settings.canCreateCalendar ? <p><a href="#google">Geef eerst de aanvullende toestemming voor agenda aanmaken.</a></p> : <form onSubmit={event => { event.preventDefault(); void action("create"); }}>
        <label htmlFor="calendar-name">Agendanaam</label><input id="calendar-name" value={name} maxLength={200} required disabled={busy} onChange={event => setName(event.target.value)} />
        <label htmlFor="calendar-zone">Tijdzone van de nieuwe agenda</label><input id="calendar-zone" value={timeZone} required disabled={busy} onChange={event => setTimeZone(event.target.value)} />
        <button disabled={busy || !ready || !!settings.calendarCreation}>Agenda aanmaken</button></form>}</details>
    </>}
    <div role="status">{message && <p className="notice">{message}</p>}</div>
  </section>;
}
