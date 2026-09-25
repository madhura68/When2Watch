import { retention } from "@/server/retention";

export const dynamic = "force-dynamic";
export const metadata = { title: "Privacy · When2Watch" };

/** Public statement. Controller and contact come from the deployment; nothing fictitious is published. */
export default function Privacy() {
  const controller = process.env.W2W_PRIVACY_CONTROLLER?.trim(), contact = process.env.W2W_PRIVACY_CONTACT?.trim();
  return <>
    <section className="hero compact"><p className="eyebrow">Privacy</p><h1>Wat When2Watch bewaart en waarom.</h1></section>
    <section className="card">
      <h2>Doel</h2>
      <p>When2Watch zet uitzenddata van series die je volgt als hele-dagafspraken in een eigen Google-agenda. Toegang is alleen op uitnodiging.</p>
      <h2>Beheerder en contact</h2>
      {controller && contact ? <p>{controller} · {contact}</p> : <p>De gegevens van de beheerder worden bij ingebruikname van deze installatie ingevuld.</p>}
      <h2>Welke gegevens</h2>
      <ul>
        <li>Je Google-naam en e-mailadres om je te herkennen bij het inloggen.</li>
        <li>Google-toegang (versleuteld opgeslagen) om je agendalijst te lezen en alleen de agenda te beheren die When2Watch zelf aanmaakt.</li>
        <li>De series die je volgt of probeert, je voorkeuren en de afspraken die When2Watch in jouw agenda heeft gezet.</li>
      </ul>
      <p>Seriegegevens komen van <a href="https://www.tvmaze.com">TVmaze</a> en worden gedeeld tussen gebruikers; wie welke serie volgt, deelt When2Watch niet. De beheerder ziet per serie alleen het aantal volgers, niet wie ze zijn en niet je agenda.</p>
      <h2>Bewaartermijnen</h2>
      <ul>
        <li>Zoekresultaten: 1 uur (lege resultaten 10 minuten).</li>
        <li>Synchronisatiegeschiedenis: {retention.syncDiagnosticsDays} dagen. Beheerlog: {retention.auditDays} dagen, zonder namen of adressen.</li>
        <li>Afgehandelde uitnodigingen: {retention.terminalInvitationDays} dagen. Back-ups: maximaal 30 dagen.</li>
      </ul>
      <h2>Je rechten</h2>
      <p>Onder <a href="/settings#privacy">Instellingen</a> download je al je gegevens of verwijder je je account. Afspraken in je Google-agenda blijven dan staan; die beheer je zelf in Google Agenda. Een verwijderd account komt ook na het terugzetten van een back-up niet terug.</p>
      <h2>Hosting</h2>
      <p>When2Watch draait op een eigen server. Wie die server beheert, kan technisch bij de database; dat valt buiten wat de app zelf toont of toestaat.</p>
    </section>
  </>;
}
