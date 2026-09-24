"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Show } from "@/server/tvmaze";
import type { Overview } from "@/server/overview";
import type { SyncResult } from "@/server/sync";
import { LatestSearch, MIN_SEARCH_LENGTH } from "@/lib/latest-search";
import { AuthButton } from "./auth-buttons";

const timestamp=(value:string|null)=>value ? new Date(value).toLocaleString("nl-NL",{timeZone:"Europe/Amsterdam",dateStyle:"short",timeStyle:"short"}) : "Nog niet";
const episodeDate=(value:string)=>new Date(`${value}T12:00:00Z`).toLocaleDateString("nl-NL",{timeZone:"Europe/Amsterdam",day:"numeric",month:"long"});
const sourceStatus=(value:string)=>({Running:"Lopend",Ended:"Beëindigd","To Be Determined":"Vervolg nog onzeker"}[value]??"Status onbekend");

export function SeriesPanel({data}:{data:Overview}) {
  const router=useRouter();
  const [query,setQuery]=useState(""),[matches,setMatches]=useState<Show[]>([]),[more,setMore]=useState(false);
  const [searching,setSearching]=useState(false),[searched,setSearched]=useState(false),[searchError,setSearchError]=useState("");
  const [busy,setBusy]=useState(false),[message,setMessage]=useState(""),[failed,setFailed]=useState(false);
  const search=useMemo(()=>new LatestSearch<Show[]>(async(q,signal)=>{
    const response=await fetch(`/api/shows/search?q=${encodeURIComponent(q)}`,{signal});const body=await response.json();
    if(!response.ok)throw new Error(body.error??"Zoeken is niet gelukt. Probeer opnieuw.");return body.shows;
  }),[]);
  useEffect(()=>{
    const timer=setTimeout(()=>{
      if(query.trim().length < MIN_SEARCH_LENGTH)return;
      void search.find(query,result=>{setMatches(result);setSearching(false);setSearched(true);},error=>{
        setSearchError(error instanceof Error?error.message:"Zoeken is niet gelukt. Probeer opnieuw.");setSearching(false);
      });
    },350);
    return()=>{clearTimeout(timer);search.cancel();};
  },[query,search]);
  function changeQuery(value:string) {
    search.cancel();setQuery(value);setMatches([]);setMore(false);setSearched(false);setSearchError("");setSearching(value.trim().length >= MIN_SEARCH_LENGTH);
  }
  async function action(showId?:number) {
    setBusy(true);setFailed(false);setMessage(showId?"Serie toevoegen en agenda bijwerken…":"Agenda synchroniseren…");
    try {
      const response=await fetch(showId?"/api/shows":"/api/sync",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(showId?{showId:String(showId)}:{})});
      const body:SyncResult & {error?:string}=await response.json();
      if(body.series) {
        const counts=body.series.reduce((a,s)=>({created:a.created+s.created,updated:a.updated+s.updated,deleted:a.deleted+s.deleted,unchanged:a.unchanged+s.unchanged}),{created:0,updated:0,deleted:0,unchanged:0});
        setMessage(`${response.ok?"Agenda bijgewerkt.":"Synchronisatie niet volledig gelukt."} ${counts.created} toegevoegd · ${counts.updated} bijgewerkt · ${counts.deleted} opgeruimd · ${counts.unchanged} ongewijzigd.${response.ok?"":" Bekijk de fout bij de serie en probeer opnieuw."}`);
        setFailed(!response.ok);
      } else throw new Error(body.error??"Deze actie is niet gelukt.");
    } catch(error) {setFailed(true);setMessage(error instanceof Error?error.message:"Verbinding onderbroken. Probeer dezelfde actie opnieuw.");}
    finally {router.refresh();setBusy(false);}
  }
  return <>
    {data.needsReauth&&<section className="notice error"><p>De Google-toegang moet opnieuw worden gekoppeld. Je series blijven bewaard.</p><AuthButton/></section>}
    <section className="calendar-summary"><div><strong>{data.calendar?.summary??"Bevestig je agenda"}</strong><p className="muted small">{data.calendar?"Hele-dagafspraken · oorspronkelijke uitzenddatum":"Ga naar Instellingen om je When2Watch-agenda te controleren."}</p></div><a href="/settings">Instellingen</a></section>
    <section className="card search-card">
      <h2>Een serie volgen</h2><label htmlFor="series-query">Naam van de tv-serie</label>
      <input id="series-query" type="search" placeholder="Bijvoorbeeld Slow Horses" autoComplete="off" maxLength={200} value={query} onChange={e=>changeQuery(e.target.value)} aria-describedby="search-help"/>
      <p id="search-help" className="muted small">Typ minimaal {MIN_SEARCH_LENGTH} tekens. Kies de juiste serie uit de beste matches. Ook met een typefout kun je zoeken.</p>
      <div aria-live="polite">
        {searching&&<p>Zoeken…</p>}
        {searchError&&<p className="notice error">{searchError} <button onClick={()=>{const q=query;changeQuery("");setTimeout(()=>changeQuery(q),0);}}>Opnieuw zoeken</button></p>}
        {searched&&matches.length===0&&<p>Geen serie gevonden. Probeer een andere spelling of de oorspronkelijke titel.</p>}
      </div>
      <ul className="matches">{(more?matches:matches.slice(0,5)).map(show=>{
        const followed=data.shows.some(s=>s.id===show.id);
        return <li className="match" key={show.id}>
          {show.poster?<img src={show.poster} alt="" width={44} height={62}/>:<span className="poster-placeholder" aria-hidden="true">TV</span>}
          <div className="match-info"><strong>{show.name}</strong><p>{[show.year,show.platform,show.country].filter(Boolean).join(" · ")||"Geen aanvullende gegevens"}</p><a href={show.url} target="_blank" rel="noreferrer">Bekijk op TVmaze</a></div>
          <button disabled={busy||followed} onClick={()=>void action(show.id)} aria-label={followed?`${show.name} volg je al`:`Volg ${show.name}`}>{followed?"Volg je al":"Volgen"}</button>
        </li>;
      })}</ul>
      {!more&&matches.length>5&&<button className="secondary" onClick={()=>setMore(true)}>Toon de overige {matches.length-5} resultaten</button>}
      {searched&&matches.length>0&&<p className="muted small">Staat jouw serie er niet bij? Probeer een andere spelling of de oorspronkelijke titel.</p>}
    </section>
    <div aria-live="polite" aria-atomic="true">{message&&<p className={`notice ${failed?"error":"success"}`}>{message}</p>}</div>
    <div className="section-heading"><h2>Jouw series <span className="muted">{data.shows.length}</span></h2><button disabled={busy||!data.shows.length} onClick={()=>void action()}>{busy?"Bezig…":"Nu synchroniseren"}</button></div>
    {!data.shows.length&&<p className="muted">Je volgt nog geen serie. Zoek hierboven je eerste serie.</p>}
    {data.shows.map(show=><section className="card" key={show.id}>
      <div className="show-heading"><div><span className="tag">{sourceStatus(show.status)}</span><h2>{show.title}</h2><p className="muted small">{[show.year,show.platform,show.country].filter(Boolean).join(" · ")}</p></div><a href={show.sourceUrl} target="_blank" rel="noreferrer">TVmaze ↗</a></div>
      {show.error&&<p className="notice error">{show.error}</p>}
      {show.upcoming.length?<ul className="episodes">{show.upcoming.map(e=><li key={e.id}><div><strong>{e.season!==null&&e.number!==null?`S${String(e.season).padStart(2,"0")}E${String(e.number).padStart(2,"0")}`:"Aflevering"}</strong> {e.title}<br/><span className="muted small">{e.linked?"In je agenda":"Agenda nog niet bevestigd"}</span></div><time dateTime={e.date}>{episodeDate(e.date)}</time></li>)}</ul>:<p className="muted">{show.status==="Ended"?"Deze serie is beëindigd; er zijn geen komende uitzenddatums bekend.":"Nog geen volgende uitzenddatum bekend. Je blijft deze serie volgen."}</p>}
      {show.unknownDates>0&&<p className="muted small">{show.unknownDates} aflevering(en) zonder bekende uitzenddatum; daarvoor staat er geen agenda-item.</p>}
      <p className="muted small">Laatste poging: {timestamp(show.lastAttempt)}<br/>Laatste succes: {timestamp(show.lastSuccess)}</p>
    </section>)}
    <p className="muted small">De agenda bevat afleveringen vanaf zeven dagen geleden en alle bekende komende datums. Beschikbaarheid in Nederland kan afwijken.</p>
    <p className="muted small">Gegevens: <a href="https://www.tvmaze.com/" target="_blank" rel="noreferrer">TVmaze</a> · <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noreferrer">CC BY-SA</a>. Laatste synchronisatie: {timestamp(data.lastRun?.finishedAt??null)}.</p>
  </>;
}
