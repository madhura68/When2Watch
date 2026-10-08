import { formatDayLabel } from "@/lib/dates";
import type { AgendaOverview } from "@/server/agenda";
import { SeriesBanner } from "./series-banner";


export function AgendaPanel({ data }: { data: AgendaOverview }) {
  const last = new Date(`${data.window.untilExclusive}T12:00:00Z`); last.setUTCDate(last.getUTCDate() - 1);
  const count = data.groups.reduce((total, group) => total + group.episodes.length, 0);
  return <>
    <div className="agenda-period"><div><strong>{formatDayLabel(data.window.from)} to {formatDayLabel(last.toISOString().slice(0, 10))}</strong>
      <p className="muted small">{count} {count === 1 ? "episode" : "episodes"} · {data.preferences.agendaMonths} {data.preferences.agendaMonths === 1 ? "month" : "months"} ahead</p>
    </div><a href="/settings#preferences">Change period</a></div>
    {data.needsReauth && <p className="notice error">Your saved overview remains available. <a href="/settings">Reconnect Google</a> to resume calendar updates.</p>}
    {!data.calendar && <p className="notice">No Google Calendar has been confirmed yet. <a href="/settings">Check your calendar</a>.</p>}
    {data.lastRun?.status && data.lastRun.status !== "success" && <p className="notice">The latest sync has not finished completely. <a href="/following">View the status of your series</a>.</p>}
    {!data.groups.length && <section className="card empty-agenda"><h2>No new episodes for now.</h2><p>No air dates are known in this period for the series you follow.</p><p><a href="/following">View or follow your series</a>, or choose a longer period in Settings.</p></section>}
    {data.groups.map(group => <section className="agenda-day" key={group.date} aria-labelledby={`day-${group.date}`}>
      <h2 id={`day-${group.date}`} className="agenda-day-label"><time dateTime={group.date}>{formatDayLabel(group.date, true)}</time></h2>
      <ul className="agenda-episodes">{group.episodes.map(episode => <li key={`${episode.show.id}-${episode.id}`} className="agenda-episode">
        <SeriesBanner bannerUrl={episode.show.bannerUrl} backgroundUrl={episode.show.backgroundUrl} poster={episode.show.poster} />
        <div className="agenda-episode-body">
          <div className="agenda-episode-heading"><div><p className="eyebrow">{episode.show.platform ?? "Followed series"}</p><h3>{episode.show.title}</h3></div>
            <span className={`tag${episode.linked ? " success" : ""}`}>{episode.linked ? "In your calendar" : "Not confirmed yet"}</span></div>
          <p className="episode-title"><strong>{episode.season !== null && episode.number !== null ? `S${String(episode.season).padStart(2, "0")}E${String(episode.number).padStart(2, "0")}` : "Episode"}</strong>{episode.title ? ` · ${episode.title}` : ""}</p>
          {episode.show.error && <p className="notice error">{episode.show.error}</p>}
          {episode.summaryText && <details className="episode-description"><summary>Description (spoilers)</summary><p>{episode.summaryText}</p></details>}
          <a className="source-link" href={episode.sourceUrl} target="_blank" rel="noreferrer">View on TVmaze ↗</a>
        </div>
      </li>)}</ul>
    </section>)}
    <p className="muted small">Original air dates according to <a href="https://www.tvmaze.com/" target="_blank" rel="noreferrer">TVmaze</a> · <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noreferrer">CC BY-SA</a>. Availability in the Netherlands may vary. The selected period does not change your Google Calendar.</p>
  </>;
}
