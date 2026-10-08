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
      if (!response.ok) { setNeedsLogin(body.code === "FRESH_LOGIN_REQUIRED"); throw new Error(body.error ?? "Deletion failed."); }
      window.location.assign("/");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Connection interrupted; refresh the page to check whether your account still exists."); }
    finally { setBusy(false); }
  }
  async function relogin() { await signOut({ redirect: false }); await signIn("google", { callbackUrl: "/settings#privacy" }, { prompt: "login" }); }
  return <section className="card settings-form" id="privacy"><h2>Your data</h2>
    <p>Download everything When2Watch stores about you. Also read the <a href="/privacy">privacy statement</a>.</p>
    <p><a className="button" href="/api/account/export" download>Download my data</a></p>
    <h3>Delete account</h3>
    {lastAdmin ? <p className="notice">You are the last administrator. Make someone else an administrator before deleting your account.</p> : <>
      <p>Your series, settings, Google connection, and sync history will be deleted. <strong>Events already in your Google Calendar will remain there</strong>; delete them yourself in Google Calendar if you no longer want them. For security, you must sign in again within 10 minutes before deleting your account.</p>
      <label htmlFor="delete-confirmation">Type DELETE to confirm</label>
      <input id="delete-confirmation" value={confirmation} disabled={busy} autoComplete="off" onChange={event => setConfirmation(event.target.value)} />
      <div className="form-row"><button className="danger" disabled={busy || confirmation !== "DELETE"} onClick={() => void remove()}>Permanently delete account</button>
        {needsLogin && <button disabled={busy} onClick={() => void relogin()}>Sign in again</button>}</div>
    </>}
    <div role="status">{message && <p className="notice error">{message}</p>}</div>
  </section>;
}
