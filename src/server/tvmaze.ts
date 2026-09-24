import { AppError } from "./errors";
import { MIN_SEARCH_LENGTH } from "@/lib/latest-search";
import { summaryText } from "./summary-text";

export type Show = { id: number; name: string; url: string; year: string | null; poster: string | null; platform: string | null; country: string | null; status: string };
export type ShowDetails = { summaryText: string | null; genres: string[]; runtimeMinutes: number | null };
export type SourceEpisode = { id: number; name: string | null; season: number | null; number: number | null; airdate: string | null; url: string; summaryText: string | null };
export type Snapshot = { show: Show & ShowDetails; episodes: SourceEpisode[] };
export interface BannerSource { banner(id: number): Promise<string | null> }
export interface EpisodeSource { snapshot(id: number): Promise<Snapshot>; banner?: BannerSource["banner"] }
const invalid = () => new AppError("INVALID_SOURCE", 502, "TVmaze gaf onvolledige of ongeldige gegevens. Je agenda blijft behouden.");
const object = (v: unknown): Record<string, any> => { if (!v || typeof v !== "object" || Array.isArray(v)) throw invalid(); return v; };
const idNumber = (v: unknown): number => { if (!Number.isSafeInteger(v) || (v as number) <= 0) throw invalid(); return v as number; };
const text = (v: unknown) => typeof v === "string" && v.trim() ? v.trim() : null;
const optionalNumber = (v: unknown) => { if (v == null) return null; if (!Number.isSafeInteger(v) || (v as number) < 0) throw invalid(); return v as number; };

export function validDate(v: unknown): v is string {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v) || v < "0001-01-01" || v >= "9999-12-31") return false;
  const d = new Date(`${v}T00:00:00Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0,10) === v;
}
function safeUrl(value: unknown, host: string): string | null {
  try { const u = new URL(String(value)); return u.protocol === "https:" && u.hostname === host ? u.href : null; } catch { return null; }
}
function parseShow(input: unknown): Show {
  const s = object(input), id = idNumber(s.id), name = text(s.name);
  if (!name) throw invalid();
  return { id, name, url: safeUrl(s.url,"www.tvmaze.com") ?? `https://www.tvmaze.com/shows/${id}`,
    year: validDate(s.premiered) ? s.premiered.slice(0,4) : null,
    poster: safeUrl(s.image?.medium,"static.tvmaze.com"), platform: text(s.network?.name) ?? text(s.webChannel?.name),
    country: text(s.network?.country?.name) ?? text(s.webChannel?.country?.name), status: text(s.status) ?? "Unknown" };
}
export function parseSearch(input: unknown): Show[] {
  if (!Array.isArray(input)) throw invalid();
  const seen = new Set<number>();
  return input.map(x => parseShow(object(x).show)).filter(s => { if (seen.has(s.id)) return false; seen.add(s.id); return true; });
}
export function parseBanner(input: unknown): string | null {
  if (!Array.isArray(input)) throw invalid();
  const banners: { id: number; main: boolean; url: string }[] = [];
  for (const item of input) {
    const image = object(item), id = idNumber(image.id);
    if (image.type !== null && typeof image.type !== "string") throw invalid();
    if (image.type !== "banner") continue;
    const resolutions = object(image.resolutions);
    const url = safeUrl(object(resolutions.medium ?? resolutions.original).url, "static.tvmaze.com");
    if (!url) throw invalid();
    const parsed = new URL(url);
    if (parsed.username || parsed.password || parsed.port) throw invalid();
    banners.push({ id, main: image.main === true, url });
  }
  banners.sort((a, b) => Number(b.main) - Number(a.main) || a.id - b.id);
  return banners[0]?.url ?? null;
}
export function parseSnapshot(input: unknown, expectedId: number): Snapshot {
  const raw = object(input), show = parseShow(raw);
  if (show.id !== expectedId || !Array.isArray(raw._embedded?.episodes)) throw invalid();
  const seen = new Set<number>(), episodes: SourceEpisode[] = [];
  for (const item of raw._embedded.episodes) {
    const e = object(item), id = idNumber(e.id);
    if (seen.has(id)) throw invalid(); seen.add(id);
    if (["significant_special","insignificant_special"].includes(e.type)) continue;
    if (e.type !== "regular") throw invalid();
    const unknownDate = e.airdate === "" || e.airdate === null;
    if (!unknownDate && !validDate(e.airdate)) throw invalid();
    episodes.push({ id, name: text(e.name), season: optionalNumber(e.season), number: optionalNumber(e.number),
      airdate: unknownDate ? null : e.airdate, url: safeUrl(e.url,"www.tvmaze.com") ?? `https://www.tvmaze.com/episodes/${id}`, summaryText: summaryText(e.summary) });
  }
  const genres = Array.isArray(raw.genres) ? [...new Set(raw.genres.filter((g): g is string => typeof g === "string").map(g => g.trim()).filter(Boolean))] : [];
  const runtimeMinutes = [raw.averageRuntime, raw.runtime].find(value => typeof value === "number" && Number.isInteger(value) && value > 0 && value <= 2147483647) ?? null;
  return { show: { ...show, summaryText: summaryText(raw.summary), genres, runtimeMinutes }, episodes };
}

// The single app process spaces all source requests, including search and cron.
const shared = globalThis as typeof globalThis & { w2wSourceRate?: { tail: Promise<void>; last: number } };
const rate = shared.w2wSourceRate ??= { tail: Promise.resolve(), last: 0 };
export class TVmaze implements EpisodeSource {
  constructor(private readonly fetcher: typeof fetch = fetch, private readonly pause = (ms: number) => new Promise<void>(r => setTimeout(r,ms))) {}
  private async request(path: string): Promise<unknown> {
    const failed = () => new AppError("SOURCE_UNAVAILABLE",502,"TVmaze is tijdelijk niet bereikbaar. Probeer opnieuw.");
    for (let attempt=0; attempt<3; attempt++) {
      const previous = rate.tail; let release!: () => void;
      rate.tail = new Promise<void>(r => { release=r; });
      await previous;
      let response: Response;
      try {
        await this.pause(Math.max(0,rate.last + 600 - Date.now())); rate.last=Date.now();
        response = await this.fetcher(`https://api.tvmaze.com${path}`,{cache:"no-store",signal:AbortSignal.timeout(10_000)});
      } catch { throw failed(); } finally { release(); }
      if (response.status === 429 && attempt < 2) {
        const value=response.headers.get("retry-after"), seconds=value===null ? 1 : Number(value);
        if (!Number.isFinite(seconds) || seconds<0 || seconds>10) throw failed();
        await this.pause(Math.max(1000,seconds*1000)); continue;
      }
      if (!response.ok) throw failed();
      try { return await response.json(); } catch { throw invalid(); }
    }
    throw failed();
  }
  async search(query: string): Promise<Show[]> {
    const q=query.trim(); if (q.length < MIN_SEARCH_LENGTH) return [];
    if(q.length>200) throw new AppError("INVALID_QUERY",400,"Gebruik een kortere serienaam.");
    return parseSearch(await this.request(`/search/shows?q=${encodeURIComponent(q)}`));
  }
  async snapshot(id: number): Promise<Snapshot> {
    idNumber(id); return parseSnapshot(await this.request(`/shows/${id}?embed=episodes`),id);
  }
  async banner(id: number): Promise<string | null> {
    idNumber(id); return parseBanner(await this.request(`/shows/${id}/images`));
  }
}
