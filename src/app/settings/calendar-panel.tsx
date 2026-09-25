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
    const body = await response.json(); if (!response.ok) throw new Error(body.error ?? "Deze actie is niet gelukt."); return body;
  }
  async function run(work: () => Promise<string>) {
    setBusy(true); setMessage("");
    try { setMessage(await work()); } catch (error) { setMessage(error instanceof Error ? error.message : "Verbinding onderbroken. Vernieuw de lijst voordat je opnieuw een agenda aanmaakt."); }
    finally { router.refresh(); setBusy(false); }
  }
  const current = settings.calendar, paused = current && current.state !== "ok", ready = settings.calendarPermission && !settings.needsReauth;
  const pending = settings.calendarCreation && ["sending", "uncertain"].includes(settings.calendarCreation.status) ? settings.calendarCreation : null;
  const checkName = () => run(async () => {
    const body = await request(`/api/settings/calendars?name=${encodeURIComponent(name)}`); setMatches(body.matches);
    return body.matches.length ? "Er bestaat al een agenda met deze naam. Een agenda die When2Watch niet zelf maakte kun je niet koppelen; kies dan een andere naam." : "Deze naam is vrij.";
  });
  const create = () => run(async () => {
    const body = await request("/api/settings/calendars", { requestId: crypto.randomUUID(), name, timeZone });
    setCalendars(previous => [...previous.filter(c => c.id !== body.calendar.id), body.calendar]);
    return current ? "De nieuwe agenda is aangemaakt. Stap hieronder bewust over." : "De nieuwe agenda is aangemaakt, teruggelezen en gekozen.";
  });
  const choose = (id: string) => run(async () => {
    await request("/api/settings/calendar", current && current.id !== id ? { calendarId: id, switch: true, acknowledgeOldItems: acknowledged } : { calendarId: id });
    return "De agenda is gekozen. Nieuwe afspraken komen voortaan hierin.";
  });
  const list = () => run(async () => { const body = await request("/api/settings/calendars"); setCalendars(body.calendars); return body.calendars.length ? "Dit zijn je When2Watch-agenda's." : "Je hebt nog geen agenda die When2Watch zelf heeft aangemaakt."; });
  return <section className="card settings-form" id="agenda-keuze"><h2>Je Google-agenda</h2>
    {current ? <p className={`notice ${paused ? "error" : "success"}`}><strong>{current.name}</strong> · {current.timeZone}<br /><span className="calendar-id">{current.id}</span></p>
      : <p>Maak een aparte agenda voor When2Watch aan. Tot die tijd kun je series volgen en lokaal bekijken.</p>}
    {current?.state === "legacy" && <p className="notice error">Deze agenda is niet door When2Watch aangemaakt. Met de beperkte Google-rechten kan When2Watch hem niet meer bijwerken; synchroniseren is gepauzeerd. Je series en overzicht blijven gewoon zichtbaar. Maak een nieuwe When2Watch-agenda en stap bewust over.</p>}
    {current?.state === "permission" && <p className="notice error">Synchroniseren is gepauzeerd: geef bij je Google-account opnieuw toegang tot de agendalijst en je When2Watch-agenda.</p>}
    {current && current.timeZone !== settings.preferences.timeZone && <p className="notice">Je Google-agenda gebruikt {current.timeZone}; When2Watch gebruikt {settings.preferences.timeZone}. Hele-dagafspraken behouden hun uitzenddatum. Controleer de meldingstijd in je agenda-app.</p>}
    {!ready && <p><a href="#google">Geef eerst de benodigde Google-agendatoegang.</a></p>}
    {pending && <p className="notice">De aanmaak van “{pending.name}” is niet bevestigd. When2Watch maakt hem niet opnieuw aan en koppelt niets op naam.
      <button disabled={busy} onClick={() => void run(async () => { await request("/api/settings/calendars", { action: "abandon", requestId: pending.id }); return "Aanvraag losgelaten. Kies voor een nieuwe agenda een andere naam."; })}>Aanvraag loslaten</button></p>}
    {(!current || paused) && ready && <>
      <form onSubmit={event => { event.preventDefault(); void create(); }}>
        <label htmlFor="calendar-name">Naam van de nieuwe agenda (1–100 tekens)</label>
        <input id="calendar-name" value={name} maxLength={100} required disabled={busy} onChange={event => { setName(event.target.value); setMatches(null); }} />
        <label htmlFor="calendar-zone">Tijdzone</label><input id="calendar-zone" value={timeZone} required disabled={busy} onChange={event => setTimeZone(event.target.value)} />
        <div className="form-row"><button type="button" disabled={busy} onClick={() => void checkName()}>Naam controleren</button>
          <button className="primary" disabled={busy || !!pending || !!matches?.some(m => !m.reusable)}>Agenda aanmaken</button></div>
      </form>
      {matches?.filter(m => m.reusable).map(m => <p key={m.id}>Je eerdere When2Watch-agenda “{m.summary}” <button disabled={busy} onClick={() => void choose(m.id)}>Deze gebruiken</button></p>)}
      <button disabled={busy} onClick={() => void list()}>Mijn When2Watch-agenda's tonen</button>
      {current && <label className="checkbox"><input type="checkbox" checked={acknowledged} onChange={event => setAcknowledged(event.target.checked)} /> Ik begrijp dat bestaande afspraken in de oude agenda blijven staan en dubbel zichtbaar kunnen zijn. When2Watch verplaatst of verwijdert ze niet.</label>}
      {calendars.filter(c => c.id !== current?.id).map(c => <p key={c.id}>{c.summary} · {c.timeZone} <button className="primary" disabled={busy || (!!current && !acknowledged)} onClick={() => void choose(c.id)}>{current ? "Overstappen naar deze agenda" : "Deze agenda kiezen"}</button></p>)}
    </>}
    <div role="status">{message && <p className="notice">{message}</p>}</div>
  </section>;
}
