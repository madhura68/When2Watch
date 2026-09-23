"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  calendarId: string;
  calendar: { name: string; timeZone: string; confirmedAt: string; reminders: string } | null;
  tomorrow: string;
  probes: { id: string; date: string; status: string; request: string; readback: string | null }[];
};

export function TrialPanel({ calendarId, calendar, tomorrow, probes }: Props) {
  const router = useRouter();
  const [date, setDate] = useState(tomorrow);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  async function action(path: string, method: string, payload: object, success: string) {
    setBusy(true); setMessage(""); setFailed(false);
    try {
      const result = await fetch(path, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const response = await result.json();
      if (!result.ok) throw new Error(response.error ?? "Deze actie is niet gelukt.");
      setMessage(success);
      router.refresh();
    } catch (error) { setFailed(true); setMessage(error instanceof Error ? error.message : "Verbinding onderbroken. Probeer dezelfde actie opnieuw."); }
    finally { setBusy(false); }
  }
  return <>
    <div aria-live="polite" aria-atomic="true">{message && <p className={`notice ${failed ? "error" : "success"}`}>{message}</p>}</div>
    <section className="card">
      <span className="step">02</span><h2>Jouw proefagenda</h2>
      <p>De vooraf gekozen agenda is <strong>When2Watch</strong>. Controleer de identiteit en schrijfrechten voordat je het proefitem maakt.</p>
      <details><summary>Agenda-ID bekijken</summary><code className="calendar-id">{calendarId}</code></details>
      {calendar && <p className="notice success">Bevestigd via Google: <strong>{calendar.name}</strong> · {calendar.timeZone} · schrijfbaar</p>}
      <button disabled={busy} onClick={() => action("/api/calendar/verify", "POST", {}, "De gekozen agenda is teruggelezen en bevestigd.")}>{busy ? "Even geduld…" : calendar ? "Agenda opnieuw controleren" : "Controleer en bevestig deze agenda"}</button>
    </section>
    <section className="card">
      <span className="step">03</span><h2>Een melding om 09:00</h2>
      <p>Het proefitem duurt de hele dag. Het gebruikt de standaardmeldingen van de agenda. <strong>Een melding om 09:00 is nog niet bewezen.</strong></p>
      <ol className="checklist">
        <li>Controleer in Google Agenda de meldingen voor afspraken die de hele dag duren: 09:00 op dezelfde dag.</li>
        <li>Controleer dat When2Watch zichtbaar is in Agenda op je Mac en dat meldingen voor Agenda en Chrome zijn toegestaan.</li>
        <li>Laat Google Agenda in Chrome open en voorkom dat Focus de proefmelding stilhoudt.</li>
      </ol>
      <form onSubmit={(event) => { event.preventDefault(); void action("/api/probe", "POST", { date }, "Het proefitem is aangemaakt en teruggelezen. De melding in beide apps moet nog worden bevestigd."); }}>
        <label htmlFor="probe-date">Datum van de ochtendproef</label>
        <div className="form-row"><input id="probe-date" type="date" min={tomorrow} value={date} onChange={(event) => setDate(event.target.value)} required disabled={busy} /><button className="primary" disabled={busy || !calendar}>{busy ? "Even geduld…" : "Maak all-day proefitem"}</button></div>
      </form>
      {!calendar && <p className="muted small">Bevestig eerst de agenda hierboven.</p>}
      <p className="muted small">Dit is een herkenbaar proefitem voor Slow Horses, geen echte aflevering. Werkt de ochtendmelding niet, dan beoordelen we eerst de uitkomst voordat we een alternatief kiezen.</p>
    </section>
    {probes.map((probe) => <section className="card" key={probe.id}>
      <span className="tag">{probe.status === "created" ? "Teruggelezen uit Google" : probe.status === "deleted" ? "Opgeruimd" : "Aanvraag nog niet bevestigd"}</span>
      <h2>Proef van {probe.date}</h2>
      <p>Gewenst: <strong>09:00 Europe/Amsterdam</strong>. Ontvangst in Apple Agenda en Google Agenda in Chrome staat nog open. Geef na de proef per app de waargenomen datum en tijd door.</p>
      {probe.status === "prepared" && <button disabled={busy} onClick={() => action("/api/probe", "POST", { date: probe.date }, "Het bestaande proefitem is teruggevonden en bevestigd.")}>Dezelfde aanvraag hervatten</button>}
      <details><summary>Verzoek en antwoord bekijken</summary><p className="small">Deze gegevens bewijzen het agenda-item. Ze bewijzen geen ontvangen melding.</p><pre>{JSON.stringify({ request: JSON.parse(probe.request), readback: probe.readback ? JSON.parse(probe.readback) : null }, null, 2)}</pre></details>
      {probe.status !== "deleted" && <button className="secondary" disabled={busy} onClick={() => action("/api/probe", "DELETE", { id: probe.id }, "Alleen dit eigen proefitem is opgeruimd.")}>Ruim dit proefitem op</button>}
    </section>)}
  </>;
}
