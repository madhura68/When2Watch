import { retention } from "@/server/retention";
export const dynamic = "force-dynamic";
export const metadata = {title: "Privacy · When2Watch", robots: {index: true, follow: true}};
export default function Privacy() {
  const controller = process.env.W2W_PRIVACY_CONTROLLER?.trim(), contact = process.env.W2W_PRIVACY_CONTACT?.trim();
  return <>
    <section className="hero compact"><p className="eyebrow">Privacy</p><h1>What When2Watch stores and why.</h1></section>
    <section className="card">
      <h2>Purpose</h2><p>When2Watch puts the original release dates of series you follow into a calendar it creates in your Google account. You can choose all-day events or a fixed time. Access is by invitation only.</p>
      <h2>Operator and contact</h2>{controller && contact ? <p>{controller} · {contact}</p> : <p>The operator's details are filled in when this installation is set up.</p>}
      <h2>Google data we use</h2>
      <p>We use your Google name and email address to recognise you when you sign in. With your separate consent, When2Watch reads your calendar list to confirm the connection, check for a name clash, and read the name, time zone, access level and default reminders of the When2Watch calendar. We store that calendar's metadata; other calendar-list entries are not stored.</p>
      <p>When2Watch has full access only to calendars it created. It never reads or changes events in any other calendar. Access and refresh tokens are stored encrypted on the server. No Google data is shared with third parties.</p>
      <h2>Other data and sources</h2><p>We store the series you follow or try, your preferences (time zone, agenda range and event style), and the events When2Watch placed in its calendar. Episode data comes from <a href="https://www.tvmaze.com">TVmaze (CC BY-SA)</a> and is shared between users. The administrator sees follower counts for each series, not who follows it or your calendar.</p>
      <h2>Retention</h2><ul>
        <li>Search results: one hour; empty results: ten minutes.</li>
        <li>Sync diagnostics: {retention.syncDiagnosticsDays} days. Administration logs: {retention.auditDays} days, without names or addresses.</li>
        <li>Completed invitations: {retention.terminalInvitationDays} days. Backups: at most 30 days.</li>
      </ul>
      <h2>Your rights</h2><p>In <a href="/settings#privacy">Settings</a>, you can export your data or delete your account by typing DELETE. Events already in your Google Calendar remain there; you can manage those yourself in Google Calendar. A deleted account does not return after a backup is restored.</p>
      <h2>Hosting</h2><p>When2Watch runs on the operator's own server. The operator can technically access the database; this is outside what the app itself displays or permits.</p>
      <h2>Google API Services User Data Policy</h2><p>When2Watch's use and transfer of information received from Google APIs adheres to the <a href="https://developers.google.com/terms/api-services-user-data-policy">Google API Services User Data Policy</a>, including the Limited Use requirements.</p>
    </section>
  </>;
}
