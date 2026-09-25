"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import type { userSettings } from "@/server/installation";

type Settings = Awaited<ReturnType<typeof userSettings>>;
export function GooglePanel({ settings, callbackUrl }: { settings: Settings; callbackUrl: string }) {
  const router = useRouter(), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const [clientId, setClientId] = useState(""), [clientSecret, setClientSecret] = useState("");
  async function action(payload: object, connect = false) {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/settings/google", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error ?? "De koppeling is niet gelukt.");
      setClientSecret("");
      if (connect) await signIn("google", { callbackUrl: "/settings" });
      else { setMessage(payload && "De Google-keuze is verwerkt."); router.refresh(); }
    } catch (error) { setMessage(error instanceof Error ? error.message : "Verbinding onderbroken. Probeer opnieuw."); }
    finally { setBusy(false); }
  }
  async function replace(event: FormEvent) { event.preventDefault(); await action({ action: "begin", mode: "replace-client", clientId, clientSecret }, true); }
  const attempt = settings.connectionAttempt;
  return <section id="google" className="card settings-form">
    <h2>Je Google-account</h2><p><strong>{settings.account.email}</strong></p>
    <p className="muted">Je bent ingelogd als eigenaar. Je series blijven bewaard als je agendatoegang opnieuw moet geven.</p>
    <p className={`notice ${settings.calendarPermission && !settings.needsReauth ? "success" : ""}`}>{settings.calendarPermission && !settings.needsReauth ? "Google-agendatoegang is gekoppeld." : "Geef Google toestemming om je agenda’s te lezen en afspraken te beheren."}</p>
    <div className="form-row"><button disabled={busy} onClick={() => void action({ action: "begin", mode: "calendar" }, true)}>Agendatoegang {settings.calendarPermission ? "opnieuw koppelen" : "geven"}</button>
      {!settings.canCreateCalendar && <button disabled={busy} onClick={() => void action({ action: "begin", mode: "create" }, true)}>Toestemming voor agenda aanmaken</button>}</div>
    {attempt && <div className="notice"><p>{attempt.status === "completed" ? `Google heeft ${attempt.profileEmail ?? "je account"} teruggestuurd. Bevestig om de blijvende verbinding te controleren en te gebruiken.` : "Er staat een Google-koppelpoging open. Je kunt opnieuw beginnen of deze annuleren."}</p>
      <div className="form-row">{attempt.status === "completed" && <button className="primary" disabled={busy} onClick={() => void action({ action: "confirm", id: attempt.id })}>Verbinding controleren en bevestigen</button>}
        <button disabled={busy} onClick={() => void action({ action: "cancel", id: attempt.id })}>Koppelpoging annuleren</button></div></div>}
    {settings.isAdmin && <details><summary>Google OAuth-client vervangen</summary>
      <p className="small">Maak een OAuth-webclient met dit callbackadres. De nieuwe client wordt actief nadat hetzelfde Google-account en de blijvende toegang zijn gecontroleerd.</p><code className="calendar-id">{callbackUrl}</code>
      <form onSubmit={replace}>
        <label htmlFor="oauth-file">Google-credentialbestand invullen (optioneel)</label><input id="oauth-file" type="file" accept=".json,application/json" disabled={busy} onChange={async event => {
          const file = event.target.files?.[0]; if (!file) return;
          try { const data = JSON.parse(await file.text()).web; if (!data || typeof data.client_id !== "string" || typeof data.client_secret !== "string") throw new Error(); setClientId(data.client_id); setClientSecret(data.client_secret); setMessage(""); }
          catch { setMessage("Kies het JSON-bestand van een Google OAuth-webclient."); }
          event.target.value = "";
        }} />
        <label htmlFor="oauth-client">Client-ID</label><input id="oauth-client" value={clientId} autoComplete="off" onChange={event => setClientId(event.target.value)} required disabled={busy} />
        <label htmlFor="oauth-secret">Client secret</label><input id="oauth-secret" type="password" value={clientSecret} autoComplete="new-password" onChange={event => setClientSecret(event.target.value)} required disabled={busy} />
        <button disabled={busy} type="submit">Nieuwe client verbinden</button>
      </form>
    </details>}
    <div role="status">{message && <p className="notice">{message}</p>}</div>
  </section>;
}
