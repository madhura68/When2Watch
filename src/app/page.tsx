import { signedInUser } from "@/server/auth";
import { oauthReady } from "@/server/config";
import { AuthButton } from "./auth-buttons";
import { overview } from "@/server/overview";
import { SeriesPanel } from "./series-panel";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user=await signedInUser();
  if (user) return <>
    <header><a className="brand" href="/">When2Watch<span className="brand-dot">.</span></a><AuthButton logout/></header>
    <section className="hero compact"><p className="eyebrow">Je series, in je agenda</p><h1>Weet wanneer je<br/>verder kunt kijken.</h1><p className="intro">Volg je favoriete serie. Nieuwe afleveringen komen vanzelf in je When2Watch-agenda.</p></section>
    <SeriesPanel data={await overview(user.id)}/>
  </>;
  const { error } = await searchParams;
  return <>
    <header><a className="brand" href="/">When2Watch<span className="brand-dot">.</span></a><span className="tag">Eerste proef</span></header>
    <section className="hero">
      <p className="eyebrow">Je series, in je agenda</p>
      <h1>Een nieuwe aflevering.<br />Een seintje op tijd.</h1>
      <p className="intro">We beginnen met één serie en jouw Google-agenda. Eerst controleren we samen of een melding je op het juiste moment bereikt.</p>
    </section>
    <section className="card">
      <span className="step">01</span><h2>Verbind je Google-account</h2>
      <p>Log in met het toegelaten account. Je bevestigt daarna de vooraf gekozen When2Watch-agenda voor de proef.</p>
      {error && <p role="alert" className="notice error">Inloggen is niet gelukt. Gebruik het toegelaten Google-account en geef beide agendatoestemmingen. Probeer daarna opnieuw.</p>}
      {oauthReady() ? <AuthButton /> : <p className="notice">De Google-koppeling wordt nog ingericht. Zodra die klaar is kun je hier inloggen.</p>}
      <p className="muted small">Google verzorgt het inloggen. When2Watch bewaart de koppeling op de server, zodat je later niet iedere dag opnieuw hoeft in te loggen.</p>
    </section>
    <div className="steps-summary"><p><strong>1. Verbinden</strong><br />Je Google-account koppelen</p><p><strong>2. Agenda kiezen</strong><br />Je proefagenda controleren</p><p><strong>3. Melding beproeven</strong><br />Een seintje om 09:00</p></div>
  </>;
}
