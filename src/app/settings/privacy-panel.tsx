"use client";
import { useState } from "react";
import { signIn, signOut } from "next-auth/react";

export function PrivacyPanel({ lastAdmin }: { lastAdmin: boolean }) {
  const [confirmation, setConfirmation] = useState(""), [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [needsLogin, setNeedsLogin] = useState(false);
  async function remove() {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/account/delete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirmation }) });
      const body = await response.json();
      if (!response.ok) { setNeedsLogin(body.code === "FRESH_LOGIN_REQUIRED"); throw new Error(body.error ?? "Verwijderen is niet gelukt."); }
      window.location.assign("/");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Verbinding onderbroken; vernieuw de pagina om te zien of je account nog bestaat."); }
    finally { setBusy(false); }
  }
  async function relogin() { await signOut({ redirect: false }); await signIn("google", { callbackUrl: "/settings#privacy" }, { prompt: "login" }); }
  return <section className="card settings-form" id="privacy"><h2>Je gegevens</h2>
    <p>Download alles wat When2Watch over jou bewaart. Lees ook de <a href="/privacy">privacyverklaring</a>.</p>
    <p><a className="button" href="/api/account/export" download>Mijn gegevens downloaden</a></p>
    <h3>Account verwijderen</h3>
    {lastAdmin ? <p className="notice">Je bent de laatste beheerder. Maak eerst iemand anders beheerder voordat je je account verwijdert.</p> : <>
      <p>Je series, instellingen, Google-koppeling en synchronisatiegeschiedenis worden verwijderd. <strong>Afspraken die al in je Google-agenda staan blijven staan</strong>; verwijder die zelf in Google Agenda als je ze niet meer wilt. Voor de zekerheid moet je binnen 10 minuten vóór het verwijderen opnieuw zijn ingelogd.</p>
      <label htmlFor="delete-confirmation">Typ VERWIJDEREN om te bevestigen</label>
      <input id="delete-confirmation" value={confirmation} disabled={busy} autoComplete="off" onChange={event => setConfirmation(event.target.value)} />
      <div className="form-row"><button className="danger" disabled={busy || confirmation !== "VERWIJDEREN"} onClick={() => void remove()}>Account definitief verwijderen</button>
        {needsLogin && <button disabled={busy} onClick={() => void relogin()}>Opnieuw inloggen</button>}</div>
    </>}
    <div role="status">{message && <p className="notice error">{message}</p>}</div>
  </section>;
}
