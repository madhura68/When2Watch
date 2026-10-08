"use client";
import { formatEpisodeDate } from "@/lib/dates";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Show } from "@/server/tvmaze";
import type { Overview } from "@/server/overview";
import type { SyncResult } from "@/server/sync";
import { LatestSearch, MIN_SEARCH_LENGTH, SEARCH_DEBOUNCE_MS } from "@/lib/latest-search";
import { SeriesPoster } from "./series-poster";
import { sourceStatus, visibleSeries, type SourceFilter, type ChoiceFilter } from "@/lib/series-list";

const timestamp=(value:string|null,timeZone:string)=>value ? new Date(value).toLocaleString("en-GB",{timeZone,hourCycle:"h23",dateStyle:"short",timeStyle:"short"}) : "Not yet";
const episodeDate = formatEpisodeDate;
const summaryExcerpt=(text:string)=>{
  if(text.length<=400)return text;
  const boundary=text.slice(0,400).search(/\s+\S*$/);
  return `${text.slice(0,Math.max(0,boundary)).trimEnd()}…`;
};

export function SeriesPanel({data}:{data:Overview}) {
  const router=useRouter();
  const [query,setQuery]=useState(""),[matches,setMatches]=useState<Show[]>([]),[more,setMore]=useState(false);
  const [searching,setSearching]=useState(false),[searched,setSearched]=useState(false),[searchError,setSearchError]=useState("");
  const [busy,setBusy]=useState(false),[message,setMessage]=useState(""),[failed,setFailed]=useState(false);
  const [sourceFilter,setSourceFilter]=useState<SourceFilter>("all"),[choiceFilter,setChoiceFilter]=useState<ChoiceFilter>("all");
  const shown=useMemo(()=>visibleSeries(data.shows,sourceFilter,choiceFilter),[data.shows,sourceFilter,choiceFilter]);
  const search=useMemo(()=>new LatestSearch<Show[]>(async(q,signal)=>{
    const response=await fetch(`/api/shows/search?q=${encodeURIComponent(q)}`,{signal});const body=await response.json();
    if(!response.ok)throw new Error(body.error??"Search failed. Try again.");return body.shows;
  }),[]);
  useEffect(()=>{
    const timer=setTimeout(()=>{
      if(query.trim().length < MIN_SEARCH_LENGTH)return;
      void search.find(query,result=>{setMatches(result);setSearching(false);setSearched(true);},error=>{
        setSearchError(error instanceof Error?error.message:"Search failed. Try again.");setSearching(false);
      });
    },SEARCH_DEBOUNCE_MS);
    return()=>{clearTimeout(timer);search.cancel();};
  },[query,search]);
  function changeQuery(value:string) {
    search.cancel();setQuery(value);setMatches([]);setMore(false);setSearched(false);setSearchError("");setSearching(value.trim().length >= MIN_SEARCH_LENGTH);
  }
  async function action(showId?:number,trying=false) {
    setBusy(true);setFailed(false);setMessage(showId?"Adding series and updating calendar…":"Syncing calendar…");
    try {
      const response=await fetch(showId?"/api/shows":"/api/sync",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(showId?{showId:String(showId),trying}:{})});
      const body:SyncResult & {error?:string}=await response.json();
      if(body.series) {
        const counts=body.series.reduce((a,s)=>({created:a.created+s.created,updated:a.updated+s.updated,deleted:a.deleted+s.deleted,unchanged:a.unchanged+s.unchanged}),{created:0,updated:0,deleted:0,unchanged:0});
        setMessage(body.calendarState === "unconfigured" && response.ok ? "Your series and episodes have been updated. Choose a calendar in Settings to add events." : `${response.ok?"Calendar updated.":"Sync did not complete successfully."} ${counts.created} added · ${counts.updated} updated · ${counts.deleted} cleaned up · ${counts.unchanged} unchanged.${response.ok?"":" View the error for the series and try again."}`);
        setFailed(!response.ok);
      } else throw new Error(body.error??"This action failed.");
    } catch(error) {setFailed(true);setMessage(error instanceof Error?error.message:"Connection interrupted. Try the same action again.");}
    finally {router.refresh();setBusy(false);}
  }
  async function changeTrying(showId:number,trying:boolean) {
    setBusy(true);setFailed(false);setMessage("Saving preference…");
    try {
      const response=await fetch("/api/shows",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({showId:String(showId),trying})});
      const body=await response.json();
      if(!response.ok)throw new Error(body.error??"Saving failed. Try again.");
      setMessage("Preference saved. This series will continue to sync with your calendar.");
    }catch(error){setFailed(true);setMessage(error instanceof Error?error.message:"Connection interrupted. Try again.");}
    finally{router.refresh();setBusy(false);}
  }
  async function unfollow(showId:number,title:string) {
    if(!window.confirm(`Stop following ${title}? Your own calendar events for this series will be deleted; this does not affect anyone else.`))return;
    setBusy(true);setFailed(false);setMessage("Removing series…");
    try {
      const response=await fetch("/api/shows",{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({showId:String(showId)})});
      const body=await response.json();
      if(!response.ok)throw new Error(body.error??"Deletion failed. Try again.");
      setMessage(`You no longer follow ${title}.`);
    }catch(error){setFailed(true);setMessage(error instanceof Error?error.message:"Connection interrupted. Try again.");}
    finally{router.refresh();setBusy(false);}
  }
  return <>
    {data.needsReauth&&<section className="notice error"><p>Google access must be reconnected. Your series remain saved.</p><a href="/settings#google">Restore Google access</a></section>}
    <section className="calendar-summary"><div><strong>{data.calendar?.summary??"Confirm your calendar"}</strong><p className="muted small">{data.calendar?"Calendar events · original release date":"Go to Settings to check your When2Watch calendar."}</p></div><a href="/settings">Settings</a></section>
    <section className="card search-card">
      <h2>Follow a series</h2><label htmlFor="series-query">TV series name</label>
      <input id="series-query" type="search" placeholder="For example, Slow Horses" autoComplete="off" maxLength={200} value={query} onChange={e=>changeQuery(e.target.value)} aria-describedby="search-help"/>
      <p id="search-help" className="muted small">Type at least {MIN_SEARCH_LENGTH} characters. Choose the right series from the best matches. You can search with a typo too.</p>
      <div aria-live="polite">
        {searching&&<p>Searching…</p>}
        {searchError&&<p className="notice error">{searchError} <button onClick={()=>{const q=query;changeQuery("");setTimeout(()=>changeQuery(q),0);}}>Search again</button></p>}
        {searched&&matches.length===0&&<p>No series found. Try a different spelling or the original title.</p>}
      </div>
      <ul className="matches">{(more?matches:matches.slice(0,5)).map(show=>{
        const followed=data.shows.some(s=>s.id===show.id);
        return <li className="match" key={show.id}>
          {show.poster?<img src={show.poster} alt="" width={44} height={62}/>:<span className="poster-placeholder" aria-hidden="true">TV</span>}
          <div className="match-info"><strong>{show.name}</strong><p>{[show.year,show.platform,show.country].filter(Boolean).join(" · ")||"No additional information"}</p><a href={show.url} target="_blank" rel="noreferrer">View on TVmaze</a></div>
          <div className="match-actions">
            <button disabled={busy||followed} onClick={()=>void action(show.id)} aria-label={followed?`You already follow ${show.name}`:`Follow ${show.name}`}>{followed?"Already following":"Follow"}</button>
            {!followed&&<button className="outlined" disabled={busy} onClick={()=>void action(show.id,true)} aria-label={`Try ${show.name}`}>Try</button>}
          </div>
        </li>;
      })}</ul>
      {!more&&matches.length>5&&<button className="secondary" onClick={()=>setMore(true)}>Show the remaining {matches.length-5} results</button>}
      {searched&&matches.length>0&&<p className="muted small">Cannot find your series? Try a different spelling or the original title.</p>}
    </section>
    <div aria-live="polite" aria-atomic="true">{message&&<p className={`notice ${failed?"error":"success"}`}>{message}</p>}</div>
    <div className="section-heading"><h2>Your series <span className="muted">{shown.length} of {data.shows.length}</span></h2><button className="primary" disabled={busy||!data.shows.length} onClick={()=>void action()}>{busy?"Working…":"Sync now"}</button></div>
    {data.shows.length>0&&<div className="series-filters">
      <div><label htmlFor="source-filter">Series status</label><select id="source-filter" value={sourceFilter} onChange={e=>setSourceFilter(e.target.value as SourceFilter)}><option value="all">All statuses</option><option value="Running">Running</option><option value="To Be Determined">Renewal undecided</option><option value="Ended">Ended</option><option value="unknown">Status unknown</option></select></div>
      <div><label htmlFor="choice-filter">Your choice</label><select id="choice-filter" value={choiceFilter} onChange={e=>setChoiceFilter(e.target.value as ChoiceFilter)}><option value="all">All choices</option><option value="following">Follow</option><option value="trying">Try</option></select></div>
      <button className="secondary" onClick={()=>{setSourceFilter("all");setChoiceFilter("all");}}>Show all series</button>
    </div>}
    <p className="muted small" aria-live="polite">{shown.length} of {data.shows.length} series shown. Sync always updates your entire list.</p>
    {!data.shows.length&&<p className="muted">You are not following any series yet. Search above for your first series.</p>}
    {data.shows.length>0&&shown.length===0&&<p className="notice">No series match these filters. Choose ‘Show all series’ to restore your list.</p>}
    {shown.map(show=><section className="card followed-show" key={show.id} id={`show-${show.id}`}>
      <div className="show-identity">
      <div className="show-heading"><SeriesPoster src={show.poster}/><div className="show-info"><span className="tag">{sourceStatus(show.status)}</span><h2>{show.title}</h2><p className="muted small">{[show.year,show.platform,show.country].filter(Boolean).join(" · ")}</p></div><a href={show.sourceUrl} target="_blank" rel="noreferrer">TVmaze ↗</a></div>
      <div className="show-preference"><label htmlFor={`trying-${show.id}`}>Your choice for {show.title}</label><select id={`trying-${show.id}`} value={show.trying?"trying":"following"} disabled={busy} onChange={e=>void changeTrying(show.id,e.target.value==="trying")}><option value="following">Follow</option><option value="trying">Try</option></select></div><button className="secondary" disabled={busy} onClick={()=>void unfollow(show.id,show.title)}>Stop following</button>
      {show.error&&<p className="notice error">{show.error}</p>}
      </div>
      <div className="show-content">
      <details className="series-details"><summary>About this series</summary>
        {show.genres.length>0&&<p className="muted small">{show.genres.join(" · ")}</p>}
        {show.runtimeMinutes!==null&&<p className="muted small">Runtime: about {show.runtimeMinutes} min.</p>}
        {show.summaryText?<><p className="series-synopsis">{summaryExcerpt(show.summaryText)}</p>{show.summaryText.length>400&&<a href={show.sourceUrl} target="_blank" rel="noreferrer">Read more on TVmaze</a>}</>:<p className="muted small">No synopsis available yet.</p>}
      </details>
      {show.upcoming.length?<ul className="episodes">{show.upcoming.map(e=><li key={e.id}>
        <div className="episode-heading"><div><strong>{e.season!==null&&e.number!==null?`S${String(e.season).padStart(2,"0")}E${String(e.number).padStart(2,"0")}`:"Episode"}</strong> {e.title}<br/><span className="muted small">{e.linked?"In your calendar":"Calendar not confirmed yet"}</span></div><time dateTime={e.date}>{episodeDate(e.date)}</time></div>
        {e.summaryText?<details className="episode-description"><summary>Description (spoilers)</summary><p>{e.summaryText}</p></details>:<p className="muted small episode-empty">No description available yet.</p>}
      </li>)}</ul>:<p className="muted">{show.status==="Ended"?"This series has ended; no upcoming air dates are known.":"No next air date is known yet. You will keep following this series."}</p>}
      {show.unknownDates>0&&<p className="muted small">{show.unknownDates} episode(s) without a known air date; no calendar event has been created for them.</p>}
      <p className="muted small">Last attempt: {timestamp(show.lastAttempt,data.timeZone)}<br/>Last success: {timestamp(show.lastSuccess,data.timeZone)}</p>
      </div>
    </section>)}
    <p className="muted small">The calendar contains episodes from seven days ago onward and all known upcoming dates. Availability in the Netherlands may vary.</p>
    <p className="muted small">Data: <a href="https://www.tvmaze.com/" target="_blank" rel="noreferrer">TVmaze</a> · <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noreferrer">CC BY-SA</a>. Descriptions are shown as plain text and shortened where needed. Last sync: {timestamp(data.lastRun?.finishedAt??null,data.timeZone)}.</p>
  </>;
}
