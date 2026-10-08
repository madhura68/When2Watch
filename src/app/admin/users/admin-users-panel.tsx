"use client";
import { useState, type FormEvent } from "react";

type User = { id: string; name: string | null; email: string | null; role: string; accessStatus: string };
type Invitation = { id: string; email: string; expiresAt: string; status: string };
const statusLabel: Record<string, string> = { ACTIVE: "Active", BLOCKED: "Blocked", UNCLAIMED: "Not admitted", open: "Open", accepted: "Accepted", revoked: "Revoked", expired: "Expired" };

export function AdminUsersPanel({ currentUserId, users, invitations }: { currentUserId: string; users: User[]; invitations: Invitation[] }) {
  const [email, setEmail] = useState(""), [link, setLink] = useState(""), [message, setMessage] = useState(""), [busy, setBusy] = useState(false);
  async function call(path: string, method: string, body: unknown) {
    setBusy(true); setMessage("");
    try {
      const response = await fetch(path, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) { setMessage(data.error ?? "That did not work. Try again."); return null; }
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
      <h2>Invite</h2>
      <form onSubmit={invite} className="form-row">
        <label htmlFor="invite-email">Email address (Google account)</label>
        <input id="invite-email" type="email" value={email} onChange={event => setEmail(event.target.value)} required disabled={busy} />
        <button className="primary" disabled={busy} type="submit">Create invitation</button>
      </form>
      {link && <div className="notice"><p>Copy this link and share it yourself. It is shown only once, works once, and expires after 72 hours.</p>
        <code className="calendar-id">{link}</code>
        <button onClick={() => { void navigator.clipboard?.writeText(link); }}>Copy</button>
        <button onClick={() => { setLink(""); reload(); }}>Done</button></div>}
      <ul className="plain-list">{invitations.map(invitation => <li key={invitation.id}>{invitation.email} — {statusLabel[invitation.status]}
        {invitation.status === "open" && <button disabled={busy} onClick={async () => { if (await call("/api/admin/invitations", "DELETE", { id: invitation.id })) reload(); }}>Revoke</button>}</li>)}</ul>
    </section>
    <section className="card">
      <h2>Users</h2>
      <ul className="plain-list">{users.map(user => <li key={user.id}>{user.name ?? user.email} ({user.email}) — {user.role === "ADMIN" ? "Administrator, " : ""}{statusLabel[user.accessStatus]}
        {user.id !== currentUserId && user.accessStatus === "ACTIVE" && <button disabled={busy} onClick={async () => { if (await call("/api/admin/users", "PATCH", { userId: user.id, action: "block" })) reload(); }}>Block</button>}
        {user.accessStatus === "BLOCKED" && <button disabled={busy} onClick={async () => { if (await call("/api/admin/users", "PATCH", { userId: user.id, action: "reactivate" })) reload(); }}>Reactivate</button>}</li>)}</ul>
      <div role="status">{message && <p className="notice">{message}</p>}</div>
    </section>
  </>;
}
