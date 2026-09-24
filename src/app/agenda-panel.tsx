import type { AgendaOverview } from "@/server/agenda";
import { SeriesBanner } from "./series-banner";

const dayLabel = (date: string, weekday = false) => new Date(`${date}T12:00:00Z`).toLocaleDateString("nl-NL", {
  timeZone: "UTC", ...(weekday ? { weekday: "long" as const } : {}), day: "numeric", month: "long", year: "numeric",
});

export function AgendaPanel({ data }: { data: AgendaOverview }) {
  const last = new Date(`${data.window.untilExclusive}T12:00:00Z`); last.setUTCDate(last.getUTCDate() - 1);
  const count = data.groups.reduce((total, group) => total + group.episodes.length, 0);
  return <>
    <div className="agenda-period"><div><strong>{dayLabel(data.window.from)} t/m {dayLabel(last.toISOString().slice(0, 10))}</strong>
      <p className="muted small">{count} {count === 1 ? "aflevering" : "afleveringen"} · {data.preferences.agendaMonths} {data.preferences.agendaMonths === 1 ? "maand" : "maanden"} vooruit</p>
    </div><a href="/settings#voorkeuren">Periode aanpassen</a></div>
    {data.needsReauth && <p className="notice error">Je opgeslagen overzicht blijft beschikbaar. <a href="/settings">Koppel Google opnieuw</a> om de agenda weer bij te werken.</p>}
    {!data.calendar && <p className="notice">Er is nog geen Google-agenda bevestigd. <a href="/settings">Controleer je agenda</a>.</p>}
    {data.lastRun?.status && data.lastRun.status !== "success" && <p className="notice">De laatste synchronisatie is nog niet volledig afgerond. <a href="/volgen">Bekijk de status bij je series</a>.</p>}
    {!data.groups.length && <section className="card empty-agenda"><h2>Even geen nieuwe afleveringen.</h2><p>Voor je gevolgde series zijn in deze periode nog geen uitzenddatums bekend.</p><p><a href="/volgen">Bekijk of volg je series</a>, of kies een langere periode bij Instellingen.</p></section>}
    {data.groups.map(group => <section className="agenda-day" key={group.date} aria-labelledby={`day-${group.date}`}>
      <h2 id={`day-${group.date}`} className="agenda-day-label"><time dateTime={group.date}>{dayLabel(group.date, true)}</time></h2>
      <ul className="agenda-episodes">{group.episodes.map(episode => <li key={`${episode.show.id}-${episode.id}`} className="agenda-episode">
        <SeriesBanner />
        <div className="agenda-episode-body">
          <div className="agenda-episode-heading"><div><p className="eyebrow">{episode.show.platform ?? "Gevolgde serie"}</p><h3>{episode.show.title}</h3></div>
            <span className={`tag${episode.linked ? " success" : ""}`}>{episode.linked ? "In je agenda" : "Nog niet bevestigd"}</span></div>
          <p className="episode-title"><strong>{episode.season !== null && episode.number !== null ? `S${String(episode.season).padStart(2, "0")}E${String(episode.number).padStart(2, "0")}` : "Aflevering"}</strong>{episode.title ? ` · ${episode.title}` : ""}</p>
          {episode.show.error && <p className="notice error">{episode.show.error}</p>}
          {episode.summaryText && <details className="episode-description"><summary>Beschrijving (spoilers)</summary><p>{episode.summaryText}</p></details>}
          <a className="source-link" href={episode.sourceUrl} target="_blank" rel="noreferrer">Bekijk op TVmaze ↗</a>
        </div>
      </li>)}</ul>
    </section>)}
    <p className="muted small">Oorspronkelijke uitzenddatums volgens <a href="https://www.tvmaze.com/" target="_blank" rel="noreferrer">TVmaze</a> · <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noreferrer">CC BY-SA</a>. Beschikbaarheid in Nederland kan afwijken. De gekozen periode verandert je Google-agenda niet.</p>
  </>;
}
