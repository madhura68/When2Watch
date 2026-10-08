import { InvitationEntry } from "./invitation-entry";

export const dynamic = "force-dynamic";
// No external assets on this page; the token stays in the fragment and is removed at once.
export default function Invitation() {
  return <>
    <header><a className="brand" href="/">When2Watch<span className="brand-dot">.</span></a><span className="tag">Uitnodiging</span></header>
    <section className="card">
      <h1>Je bent uitgenodigd</h1>
      <p>Log in met het Google-account van het e-mailadres waarop je bent uitgenodigd. Google bevestigt dat adres; daarna heb je je eigen series, agenda en voorkeuren.</p>
      <InvitationEntry />
      <p className="muted small">De link werkt één keer en vervalt na 72 uur. Werkt hij niet, vraag de beheerder dan om een nieuwe.</p>
    </section>
  </>;
}
