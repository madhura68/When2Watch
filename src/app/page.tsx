import { signedInUser, oauthReady } from "@/server/auth";
import { AuthButton } from "./auth-buttons";
import { redirect } from "next/navigation";
import { agendaOverview } from "@/server/agenda";
import { AgendaPanel } from "./agenda-panel";
import { Navigation } from "./navigation";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user=await signedInUser();
  if (user) {
    const data = await agendaOverview(user.id);
    if (!data.calendar && data.showCount === 0) redirect("/settings");
    return <>
      <Navigation active="/" />
      <section className="hero compact"><p className="eyebrow">Dit komt eraan</p><h1>Je volgende aflevering.</h1><p className="intro">Alle bekende uitzenddatums van je gevolgde series, bij elkaar.</p></section>
      <AgendaPanel data={data} />
    </>;
  }
  const { error } = await searchParams;
  return <>
    <header><a className="brand" href="/">When2Watch<span className="brand-dot">.</span></a><span className="tag">Je series, bij elkaar</span></header>
    <section className="hero">
      <p className="eyebrow">Je series, in je agenda</p>
      <h1>Een nieuwe aflevering.<br />Een seintje op tijd.</h1>
      <p className="intro">Volg je favoriete series en bekijk de komende afleveringen. Met je Google-agenda ontvang je de meldingen die je zelf hebt ingesteld.</p>
    </section>
    <section className="card">
      <span className="step">01</span><h2>Welkom terug</h2>
      <p>Log in met het Google-account van de eigenaar van deze installatie. Je beheert je agendatoegang bij Instellingen.</p>
      {error && <p role="alert" className="notice error">Inloggen is niet gelukt. Gebruik het Google-account van de eigenaar van deze installatie. Probeer daarna opnieuw.</p>}
      {await oauthReady() ? <AuthButton /> : <p className="notice">De Google-koppeling wordt nog ingericht. Zodra die klaar is kun je hier inloggen.</p>}
      <p className="muted small">Google verzorgt het inloggen. When2Watch bewaart de koppeling op de server, zodat je later niet iedere dag opnieuw hoeft in te loggen.</p>
    </section>
    <div className="steps-summary"><p><strong>1. Verbinden</strong><br />Je Google-account koppelen</p><p><strong>2. Agenda kiezen</strong><br />Je eigen agenda kiezen</p><p><strong>3. Melding beproeven</strong><br />Op jouw ingestelde tijd</p></div>
  </>;
}
