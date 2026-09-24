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
      <h2>Controleer je agenda</h2>
      <p>Je gekozen agenda is <strong>{calendar?.name}</strong>. Controleer de toegang voordat je het proefitem maakt.</p>
      <details><summary>Agenda-ID bekijken</summary><code className="calendar-id">{calendarId}</code></details>
      {calendar && <p className="notice success">Bevestigd via Google: <strong>{calendar.name}</strong> · {calendar.timeZone} · schrijfbaar</p>}
      <button disabled={busy} onClick={() => action("/api/calendar/verify", "POST", {}, "De gekozen agenda is teruggelezen en bevestigd.")}>{busy ? "Even geduld…" : calendar ? "Agenda opnieuw controleren" : "Controleer en bevestig deze agenda"}</button>
    </section>
    <section className="card">
      <h2>Een melding beproeven</h2>
      <p>Het proefitem duurt de hele dag en gebruikt de standaardmeldingen van de agenda. De ontvangst hangt ook af van de instellingen op je apparaat.</p>
      <ol className="checklist">
        <li>Kies in je agenda-app een meldingstijd voor afspraken die de hele dag duren, bijvoorbeeld 09:00 op dezelfde dag.</li>
        <li>Controleer dat je gekozen agenda zichtbaar is en meldingen voor je agenda-app zijn toegestaan.</li>
        <li>Gebruik je Google Agenda in de browser, laat die open. Controleer ook eventuele Focus- of niet-storeninstellingen.</li>
      </ol>
      <form onSubmit={(event) => { event.preventDefault(); void action("/api/probe", "POST", { date }, "Het proefitem is aangemaakt en teruggelezen. Controleer de ontvangst in elke agenda-app die je gebruikt."); }}>
        <label htmlFor="probe-date">Datum van de meldingsproef</label>
        <div className="form-row"><input id="probe-date" type="date" min={tomorrow} value={date} onChange={(event) => setDate(event.target.value)} required disabled={busy} /><button className="primary" disabled={busy || !calendar}>{busy ? "Even geduld…" : "Maak all-day proefitem"}</button></div>
      </form>
      {!calendar && <p className="muted small">Bevestig eerst de agenda hierboven.</p>}
      <p className="muted small">Dit is een herkenbaar proefitem, geen echte aflevering. Een aangemaakt item bewijst nog niet dat je apparaat de melding heeft getoond.</p>
    </section>
    {probes.map((probe) => <section className="card" key={probe.id}>
      <span className="tag">{probe.status === "created" ? "Teruggelezen uit Google" : probe.status === "deleted" ? "Opgeruimd" : "Aanvraag nog niet bevestigd"}</span>
      <h2>Proef van {probe.date}</h2>
      <p>De meldingstijd volgt de instellingen van je agenda-app. Controleer de werkelijke ontvangst op elk apparaat dat je gebruikt.</p>
      {probe.status === "prepared" && <button disabled={busy} onClick={() => action("/api/probe", "POST", { date: probe.date }, "Het bestaande proefitem is teruggevonden en bevestigd.")}>Dezelfde aanvraag hervatten</button>}
      <details><summary>Verzoek en antwoord bekijken</summary><p className="small">Deze gegevens bewijzen het agenda-item. Ze bewijzen geen ontvangen melding.</p><pre>{JSON.stringify({ request: JSON.parse(probe.request), readback: probe.readback ? JSON.parse(probe.readback) : null }, null, 2)}</pre></details>
      {probe.status !== "deleted" && <button className="secondary" disabled={busy} onClick={() => action("/api/probe", "DELETE", { id: probe.id }, "Alleen dit eigen proefitem is opgeruimd.")}>Ruim dit proefitem op</button>}
    </section>)}
  </>;
}
