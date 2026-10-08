"use client";
import { useState, type FormEvent } from "react";

type User = { id: string; name: string | null; email: string | null; role: string; accessStatus: string };
type Invitation = { id: string; email: string; expiresAt: string; status: string };
const statusLabel: Record<string, string> = { ACTIVE: "Actief", BLOCKED: "Geblokkeerd", UNCLAIMED: "Niet toegelaten", open: "Open", accepted: "Geaccepteerd", revoked: "Ingetrokken", expired: "Verlopen" };

export function AdminUsersPanel({ currentUserId, users, invitations }: { currentUserId: string; users: User[]; invitations: Invitation[] }) {
  const [email, setEmail] = useState(""), [link, setLink] = useState(""), [message, setMessage] = useState(""), [busy, setBusy] = useState(false);
  async function call(path: string, method: string, body: unknown) {
    setBusy(true); setMessage("");
    try {
      const response = await fetch(path, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) { setMessage(data.error?.message ?? "Dat lukte niet. Probeer opnieuw."); return null; }
      return data;
    } finally { setBusy(false); }
  }
  async function invite(event: FormEvent) {
    event.preventDefault();
    const data = await call("/api/admin/invitations", "POST", { email });
    if (data) { setLink(data.link); setEmail(""); }
  }
  const reload = () => window.location.reload();
  return <>
    <section className="card">
      <h2>Uitnodigen</h2>
      <form onSubmit={invite} className="form-row">
        <label htmlFor="invite-email">E-mailadres (Google-account)</label>
        <input id="invite-email" type="email" value={email} onChange={event => setEmail(event.target.value)} required disabled={busy} />
        <button className="primary" disabled={busy} type="submit">Uitnodiging maken</button>
      </form>
      {link && <div className="notice"><p>Kopieer deze link en deel hem zelf. Hij wordt maar één keer getoond, werkt één keer en vervalt na 72 uur.</p>
        <code className="calendar-id">{link}</code>
        <button onClick={() => { void navigator.clipboard?.writeText(link); }}>Kopiëren</button>
        <button onClick={() => { setLink(""); reload(); }}>Klaar</button></div>}
      <ul className="plain-list">{invitations.map(invitation => <li key={invitation.id}>{invitation.email} — {statusLabel[invitation.status]}
        {invitation.status === "open" && <button disabled={busy} onClick={async () => { if (await call("/api/admin/invitations", "DELETE", { id: invitation.id })) reload(); }}>Intrekken</button>}</li>)}</ul>
    </section>
    <section className="card">
      <h2>Gebruikers</h2>
      <ul className="plain-list">{users.map(user => <li key={user.id}>{user.name ?? user.email} ({user.email}) — {user.role === "ADMIN" ? "Beheerder, " : ""}{statusLabel[user.accessStatus]}
        {user.id !== currentUserId && user.accessStatus === "ACTIVE" && <button disabled={busy} onClick={async () => { if (await call("/api/admin/users", "PATCH", { userId: user.id, action: "block" })) reload(); }}>Blokkeren</button>}
        {user.accessStatus === "BLOCKED" && <button disabled={busy} onClick={async () => { if (await call("/api/admin/users", "PATCH", { userId: user.id, action: "reactivate" })) reload(); }}>Heractiveren</button>}</li>)}</ul>
      <div role="status">{message && <p className="notice">{message}</p>}</div>
    </section>
  </>;
}
