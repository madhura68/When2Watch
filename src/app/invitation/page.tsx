import { InvitationEntry } from "./invitation-entry";

export const dynamic = "force-dynamic";
// No external assets on this page; the token stays in the fragment and is removed at once.
export default function Invitation() {
  return <>
    <header><a className="brand" href="/">When2Watch<span className="brand-dot">.</span></a><span className="tag">Invitation</span></header>
    <section className="card">
      <h1>You are invited</h1>
      <p>Sign in with the Google account for the email address that received the invitation. Google verifies the address; you will then have your own series, calendar, and preferences.</p>
      <InvitationEntry />
      <p className="muted small">The link works once and expires after 72 hours. If it does not work, ask the administrator for a new one.</p>
    </section>
  </>;
}
