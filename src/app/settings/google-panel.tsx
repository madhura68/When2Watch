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
      const body = await response.json(); if (!response.ok) throw new Error(body.error ?? "The connection failed.");
      setClientSecret("");
      if (connect) await signIn("google", { callbackUrl: "/settings" });
      else { setMessage(payload && "Your Google selection has been processed."); router.refresh(); }
    } catch (error) { setMessage(error instanceof Error ? error.message : "Connection interrupted. Try again."); }
    finally { setBusy(false); }
  }
  async function replace(event: FormEvent) { event.preventDefault(); await action({ action: "begin", mode: "replace-client", clientId, clientSecret }, true); }
  const attempt = settings.connectionAttempt;
  return <section id="google" className="card settings-form">
    <h2>Your Google account</h2><p><strong>{settings.account.email}</strong></p>
    <p className="muted">Your series remain saved if you need to grant calendar access again. If you use a different Google account, your old calendar remains as history; you then choose a new When2Watch calendar.</p>
    <p className={`notice ${settings.calendarPermission && !settings.needsReauth ? "success" : ""}`}>{settings.calendarPermission && !settings.needsReauth ? "Limited Google Calendar access is connected." : "Grant limited Google access: read your calendar list and manage only calendars created by When2Watch. Select both calendar permissions on the Google screen."}</p>
    <div className="form-row"><button disabled={busy} onClick={() => void action({ action: "begin", mode: "calendar" }, true)}>{settings.calendarPermission ? "Reconnect calendar access" : "Grant calendar access"}</button>
      <button disabled={busy} onClick={() => void action({ action: "begin", mode: "candidate" }, true)}>Use a different Google account</button></div>
    {attempt && <div className="notice"><p>{attempt.status === "completed" ? `Google returned ${attempt.profileEmail ?? "your account"}. Confirm to verify and use the persistent connection.` : "A Google connection attempt is pending. You can start again or cancel it."}</p>
      <div className="form-row">{attempt.status === "completed" && <button disabled={busy} onClick={() => void action({ action: "confirm", id: attempt.id })}>Check and confirm connection</button>}
        <button disabled={busy} onClick={() => void action({ action: "cancel", id: attempt.id })}>Cancel connection attempt</button></div></div>}
    {settings.isAdmin && <details><summary>Replace Google OAuth client</summary>
      <p className="small">Create an OAuth web client with this callback address. The new client becomes active after the same Google account and persistent access have been verified.</p><code className="calendar-id">{callbackUrl}</code>
      <form onSubmit={replace}>
        <label htmlFor="oauth-file">Fill in Google credentials file (optional)</label><input id="oauth-file" type="file" accept=".json,application/json" disabled={busy} onChange={async event => {
          const file = event.target.files?.[0]; if (!file) return;
          try { const data = JSON.parse(await file.text()).web; if (!data || typeof data.client_id !== "string" || typeof data.client_secret !== "string") throw new Error(); setClientId(data.client_id); setClientSecret(data.client_secret); setMessage(""); }
          catch { setMessage("Choose the JSON file for a Google OAuth web client."); }
          event.target.value = "";
        }} />
        <label htmlFor="oauth-client">Client-ID</label><input id="oauth-client" value={clientId} autoComplete="off" onChange={event => setClientId(event.target.value)} required disabled={busy} />
        <label htmlFor="oauth-secret">Client secret</label><input id="oauth-secret" type="password" value={clientSecret} autoComplete="new-password" onChange={event => setClientSecret(event.target.value)} required disabled={busy} />
        <button disabled={busy} type="submit">Connect new client</button>
      </form>
    </details>}
    <div role="status">{message && <p className="notice">{message}</p>}</div>
  </section>;
}
