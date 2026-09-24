"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { Preferences } from "@/server/preferences";

export function PreferencesPanel({ preferences }: { preferences: Preferences }) {
  const router = useRouter();
  const [months, setMonths] = useState(String(preferences.agendaMonths));
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [failed, setFailed] = useState(false);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage(""); setFailed(false);
    try {
      const response = await fetch("/api/settings/preferences", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ agendaMonths: Number(months) }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Opslaan is niet gelukt.");
      setMessage("Je periode is opgeslagen. Je Google-agenda blijft ongewijzigd."); router.refresh();
    } catch (error) { setFailed(true); setMessage(error instanceof Error ? error.message : "Verbinding onderbroken. Probeer opnieuw."); }
    finally { setBusy(false); }
  }
  return <section id="voorkeuren" className="card">
    <h2>Je Agenda-overzicht</h2><p className="muted">Kies hoe ver je vooruit wilt kijken.</p>
    <form onSubmit={save} aria-busy={busy}>
      <label htmlFor="agenda-months">Periode vanaf vandaag</label>
      <div className="form-row"><select id="agenda-months" value={months} onChange={event => setMonths(event.target.value)} disabled={busy}>
        <option value="1">Eén maand</option><option value="2">Twee maanden</option><option value="3">Drie maanden</option>
      </select><button className="primary" disabled={busy || Number(months) === preferences.agendaMonths}>{busy ? "Opslaan…" : "Opslaan"}</button></div>
      <p className="muted small">Tijdzone: {preferences.timeZone}. Deze keuze verandert alleen het overzicht in When2Watch.</p>
      <div role="status">{message && <p className={`notice ${failed ? "error" : "success"}`}>{message}</p>}</div>
    </form>
  </section>;
}
