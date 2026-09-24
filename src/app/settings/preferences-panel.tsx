"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { Preferences } from "@/server/preferences";

export function PreferencesPanel({ preferences }: { preferences: Preferences }) {
  const router = useRouter();
  const [timeZone, setTimeZone] = useState(preferences.timeZone);
  const [months, setMonths] = useState(String(preferences.agendaMonths));
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [failed, setFailed] = useState(false);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage(""); setFailed(false);
    try {
      const response = await fetch("/api/settings/preferences", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ agendaMonths: Number(months), timeZone }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Opslaan is niet gelukt.");
      setMessage("Je voorkeuren zijn opgeslagen."); router.refresh();
    } catch (error) { setFailed(true); setMessage(error instanceof Error ? error.message : "Verbinding onderbroken. Probeer opnieuw."); }
    finally { setBusy(false); }
  }
  return <section id="voorkeuren" className="card settings-form">
    <h2>Je Agenda-overzicht</h2><p className="muted">Kies hoe ver je vooruit wilt kijken.</p>
    <form onSubmit={save} aria-busy={busy}>
      <label htmlFor="agenda-months">Periode vanaf vandaag</label>
      <select id="agenda-months" value={months} onChange={event => setMonths(event.target.value)} disabled={busy}>
        <option value="1">Eén maand</option><option value="2">Twee maanden</option><option value="3">Drie maanden</option>
      </select>
      <label htmlFor="preference-zone">Tijdzone</label><input id="preference-zone" value={timeZone} onChange={event => setTimeZone(event.target.value)} required disabled={busy} list="timezones" /><datalist id="timezones"><option value="Europe/Amsterdam"/><option value="Europe/London"/><option value="America/New_York"/><option value="UTC"/></datalist>
      <p className="muted small">De periode bepaalt hoe ver je hier vooruit kijkt. De tijdzone bepaalt wat When2Watch als vandaag ziet. Stel meldingen voor hele-dagafspraken in je agenda-app in.</p>
      <button className="primary" disabled={busy || (Number(months) === preferences.agendaMonths && timeZone === preferences.timeZone)}>{busy ? "Opslaan…" : "Opslaan"}</button>
      <div role="status">{message && <p className={`notice ${failed ? "error" : "success"}`}>{message}</p>}</div>
    </form>
  </section>;
}
